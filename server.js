LoginToken.TokenCollection = new Mongo.Collection('LoginToken_tokens');

Meteor.startup(function () {
  LoginToken.TokenCollection._ensureIndex({
    token: 1,
  });
});

// Default expiration is 1 hour
let expiration = 60 * 60 * 1000;

LoginToken.setExpiration = function (exp) {
  expiration = exp;
};

// Hat can generate unique tokens
const hat = Npm.require('hat');

// Login with just a token
Accounts.registerLoginHandler(function (loginRequest) {
  // Is there an auth token? If not, just let Meteor handle it. Call it dispatch_authToken in case there's another
  // library that uses authToken
  if (!loginRequest || !loginRequest.dispatch_authToken) {
    return undefined;
  }

  // Find the matching user from the code
  const doc = LoginToken.TokenCollection.findOne({
    token: loginRequest.dispatch_authToken,
  });

  if (!doc) {
    throw new Meteor.Error('Invalid token');
  }

  if (doc.used === true) {
    throw new Meteor.Error('Token has already been used');
  }

  // Check expiration
  const now = Date.now();
  if (doc.expiresAt < now) {
    throw new Meteor.Error('Token has expired');
  }

  if (doc.removeOnUse) {
    // remove the token
    LoginToken.TokenCollection.remove(doc._id)
  } else {
    // Update it to used
    LoginToken.TokenCollection.update(doc._id, {
      $set: {
        used: true,
        usedAt: new Date(),
      },
    });
  }
  const userId = doc.userId.toString();

  // Emit events for any listeners
  LoginToken.emit('loggedInServer', userId);

  return {
    userId: userId,
  };
});

LoginToken.createTokenForUser = function (userId, options = {}) {

  check(options, {
    removeUserTokens: Match.Optional(Boolean),
    removeOnUse: Match.Optional(Boolean)
  })

  if (removeUserTokens) {
    LoginToken.removeUserTokens(userId, {allTokens: true})
  }

  const token = hat(256);
  LoginToken.TokenCollection.insert({
    userId: userId,
    expiresAt: new Date(Date.now() + expiration),
    token: token,
    removeOnUse: !!removeOnUse,
  });

  return token;
};

LoginToken.removeTokens = function (options = {}) {

  check(options, {
    allTokens: Match.Optional(Boolean),
    usedTokens: Match.Optional(Boolean),
    expiredTokens: Match.Optional(Boolean),
  })

  if (options.allTokens) {
    LoginToken.TokenCollection.remove({})
    return
  }

  if (options.expiredTokens) {
    const now = Date.now();
    LoginToken.TokenCollection.remove({expiresAt: {$lt: now}})
  }

  if (options.usedTokens) {
    LoginToken.TokenCollection.remove({used: true})
  }

}

LoginToken.removeUserTokens = function(userId, options) {

  check(options, {
    allTokens: Match.Optional(Boolean),
    usedTokens: Match.Optional(Boolean),
    expiredTokens: Match.Optional(Boolean),
  })

  if (options.allTokens) {
    LoginToken.TokenCollection.remove({userId: userId})
    return
  }

  if (options.expiredTokens) {
    const now = Date.now();
    LoginToken.TokenCollection.remove({userId: userId, expiresAt: {$lt: now}})
  }

  if (options.usedTokens) {
    LoginToken.TokenCollection.remove({userId: userId, used: true})
  }

}
