'use strict';

var inherits = require('util').inherits;

var constants = require('./util/constants');
var Conversation = require('./conversation');
var Invite = require('./invite');
var Q = require('q');
var RemoteEndpoint = require('./remoteendpoint');
var SIPJSUserAgent = require('./signaling/sipjsuseragent');
var Sound = require('./media/sound');
var Token = require('./token');
var util = require('./util');

/**
 * Construct a new {@link Endpoint}.
 * @class
 * @classdesc An {@link Endpoint} is identified by an address and
 *   can create or join {@link Conversation}s with other
 *   {@link RemoteEndpoint}s.
 * @augments RemoteEndpoint
 * @param {(Token|string)} token - the
 *   {@link Endpoint}'s {@link Token}
 * @property {string} address - the {@link Endpoint}'s address
 *   (defined by its {@link Token})
 * @property {Set<Conversation>} conversations - the {@link Conversation}s this
 *   {@link Endpoint} is active in
 * @property {bool} listening - whether the {@link Endpoint} is listening for
 *   {@link Invite}s to {@link Conversation}s
 * @property {Token} token - the {@link Endpoint}'s {@link Token}
 * @fires Endpoint#invite
 * @fires Endpoint#listen
 * @fires Endpoint#listenFailed
 * @fires Endpoint#unlisten
 * @fires Endpoint#error
 */ 
function Endpoint(token, options) {
  if (!(this instanceof Endpoint)) {
    return new Endpoint(token, options);
  }
  var self = this;
  RemoteEndpoint.call(this);

  token = typeof token === 'string' ? new Token(token) : token;
  options = util.withDefaults(options, {
    'debug': constants.DEBUG,
    'register': true,
    'sound': Sound.getDefault(),
    'userAgent': SIPJSUserAgent
  });

  var address = token.incomingClientName;
  var accountSid = token.accountSid;
  var sound = options['sound'];
  var userAgent = new options['userAgent'](token, options);

  userAgent.on('invite', function(inviteServerTransaction) {
    var invite = new Invite(inviteServerTransaction);
    invite._promise.then(function(conversation) {
      self.conversations.add(conversation);
    });
    self.emit('invite', invite);
  });

  Object.defineProperties(this, {
    '_options': {
      value: options
    },
    '_sound': {
      value: sound
    },
    '_userAgent': {
      value: userAgent
    },
    'address': {
      enumerable: true,
      get: function() {
        return this._userAgent.token.incomingClientName;
      }
    },
    'listening': {
      enumerable: true,
      get: function() {
        return this._userAgent.registered;
      }
    },
    'token': {
      enumerable: true,
      get: function() {
        return this._userAgent.token;
      }
    }
  });

  if (options['register']) {
    this.listen();
  }

  return Object.freeze(this);
}

inherits(Endpoint, RemoteEndpoint);

/**
 * Cause this {@link Endpoint} to stop listening for {@link Invite}s to
 *   {@link Conversation}s until {@link Endpoint#listen} is called again.
 * @instance
 * @fires Endpoint#unlisten
 * @returns {Promise<Endpoint>}
 */
Endpoint.prototype.unlisten = function unlisten() {
  var self = this;
  return this._userAgent.unregister().then(function() {
    setTimeout(function() {
      self.emit('unlisten', self);
    });
    return self;
  }, function(error) {
    setTimeout(function() {
      self.emit('unlisten', self);
    });
  });
};

/**
 * Cause this {@link Endpoint} to start listening for {@link Invite}s to
 *   {@link Conversation}s.
 * @instance
 * @param {(Token|string)} [token] - a new {@link Token} or {@link Token}
 *   string to listen with
 * @fires Endpoint#listen
 * @fires Endpoint#listenFailed
 * @returns {Promise<Endpoint>}
 */
Endpoint.prototype.listen = function listen(token) {
  var self = this;
  return this._userAgent.register(token).then(function() {
    setTimeout(function() {
      self.emit('listen', self);
    });
    return self;
  }, function(error) {
    setTimeout(function() {
      self.emit('listenFailed', error);
    });
    throw error;
  });
};

/**
 * Invite {@link RemoteEndpoint}s to join a {@link Conversation}.
 *   <br><br>
 *   By default, this will attempt to setup audio and video
 *   {@link Stream}s between {@link RemoteEndpoint}s. You can
 *   override this by specifying <code>options</code>.
 * @param {(string|Array<string>)} address - one or more
 *   {@link RemoteEndpoint} addresses to invite to a {@link Conversation}
 * @param {object} [options={streamConstraints:{audio:true,video:true}}]
 * @returns {Promise<Conversation>}
 */
Endpoint.prototype.invite =
  function createConversation(address, options)
{
  var self = this;
  this._sound.outgoing.play();

  var addresses = address.forEach ? address : [address];
  options = util.withDefaults(options, this._options);

  var conversation = new Conversation();
  var inviteClientTransactions = addresses.map(function(address) {
    return self._userAgent.invite(address).then(function(dialog) {
      // conversation._dialogs.push(dialog);
      conversation._addDialog(dialog);
    });
  });

  return util.any(inviteClientTransactions).then(function() {
    self._sound.outgoing.stop();
    self.conversations.add(conversation);
    return conversation;
  }, function(error) {
    self._sound.outgoing.stop();
    throw error;
  });
};

/**
 * Leave one or more {@link Conversation}s. If no {@link Conversation} is
 *   provided this leaves <em>all</em> {@link Conversation}s the
 *   {@link Endpoint} is active in.
 * @instance
 * @param {(Conversation|Array<Conversation>)} [conversation] - one or more
 *   {@link Conversation}s to leave
 * @returns {Promise<Endpoint>}
 */
Endpoint.prototype.leave = function leave(conversation) {
  var self = this;

  var conversations = conversation ? [conversation] : this.conversations;
  var dialogs = [];
  conversations.forEach(function(conversation) {
    conversation._dialogs.forEach(function(dialog) {
      if (dialog.from === self._userAgent || dialog.to === self._userAgent) {
        dialogs.push(dialog.end());
      }
    });
  });

  return Q.all(dialogs).then(function() {
    conversations.forEach(function(conversation) {
      self.conversations.delete(conversation);
    });
    return self;
  }, function() {
    conversations.forEach(function(conversation) {
      self.conversations.delete(conversation);
    });
    return self;
  });
};

/**
 * Mute or unmute any audio this {@link Endpoint} is streaming in
 *   one or more {@link Conversation}s. If no {@link Conversation} is provided,
 *   then this method mutes or unmutes audio for <em>all</em> of this
 *   {@link Endpoint}'s {@link Conversation}s.
 * @instance
 * @param {boolean} [mute=true] - whether to mute or unmute audio (defaults to
 *   mute)
 * @param {(Conversation|Array<Conversation>)} [conversation] - one or more
 *   {@link Conversation}s to mute or unmute audio for
 * @returns {Endpoint}
 */
Endpoint.prototype.muteAudio = function muteAudio(mute, conversation) {
  throw new Error('Not implemented');
};

/**
 * Pause or unpause any video this {@link Endpoint} is streaming
 *   in one or more {@link Conversation}s. If no {@link Conversation} is
 *   provided, then this method pauses or unpauses video for <em>all</em> of
 *   this {@link Endpoint}'s {@link Conversation}s.
 * @instance
 * @param {boolean} [pause=true] - whether to pause or unpause audio
 *   (defaults to pause)
 * @param {(Conversation|Array<Conversation>)} [conversation] - one or more
 *   {@link Conversation}s to pause or unpause video for
 * @returns {Endpoint}
 */
Endpoint.prototype.pauseVideo = function pauseVideo(pause, conversation) {
  throw new Error('Not implemented');
};

module.exports = Endpoint;