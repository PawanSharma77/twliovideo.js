'use strict';

var EventEmitter = require('events').EventEmitter;
var inherits = require('util').inherits;
var Q = require('q');

/**
 * Construct a {@link Dialog}.
 * @class
 * @classdesc A {@link Dialog} represents an in-progress call.
 * @param {UserAgent} - the {@link UserAgent} that owns this {@link Dialog}
 * @param {string} remote - the remote participant in the {@link Dialog}
 * @param {string} sid - the {@link Dialog}'s SID
 * @property {boolean} ended - whether the {@link Dialog} has ended
 * @property {Array<object>} iceServers - the (STUN/TURN) ICE servers
 * @property {Stream} localStream - the {@link Dialog}'s local {@link Stream}
 * @property {string} remote - the remote participant in the {@link Dialog}
 * @property {Stream} remoteStream - the {@link Dialog}'s remote {@link Stream}
 * @property {string} sid - the {@link Dialog}'s SID
 * @property {UserAgent} userAgent - the {@link UserAgent} that owns this
 *   {@link Dialog}
 * @fires Dialog#ended
 * @fires Dialog#statistics
 */
function Dialog(userAgent, remote, sid, localStream, remoteStream, iceServers) {
  var self = this;
  EventEmitter.call(this);
  var ended = false;
  Object.defineProperties(this, {
    '_ended': {
      set: function(_ended) {
        ended = _ended;
      }
    },
    'ended': {
      get: function() {
        return ended;
      }
    },
    'localStream': {
      enumerable: true,
      value: localStream
    },
    'remote': {
      enumerable: true,
      value: remote
    },
    'remoteStream': {
      enumerable: true,
      value: remoteStream
    },
    'sid': {
      enumerable: true,
      value: sid
    },
    'userAgent': {
      enumerable: true,
      value: userAgent
    }
  });
  function reinvite() {
    if (self.ended) {
      localStream.off('trackAdded', this);
      localStream.off('trackRemoved', this);
      return;
    }
    self._reinvite();
  }
  localStream.on('trackAdded', reinvite);
  localStream.on('trackRemoved', reinvite);
  return this;
}

inherits(Dialog, EventEmitter);

/**
 * Hangup the {@link Dialog}.
 * @instance
 * @returns Promise<Dialog>
 */
Dialog.prototype.end = function end() {
  if (this.ended) {
    throw new Error('Dialog already ended');
  }
  this._ended = true;
  var self = this;
  var deferred = Q.defer();
  setTimeout(function() {
    deferred.resolve(self);
    self.emit('ended', self);
  });
  return deferred.promise;
};

Dialog.prototype._reinvite = function _reinvite() {
  var deferred = Q.defer();
  setTimeout(function() {
    deferred.resolve(self);
    self.emit('reinvite', self);
  });
  return deferred.promise;
};

module.exports = Dialog;