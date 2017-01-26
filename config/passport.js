'use strict'

const co = require('co');
const GitHubStrategy = require('passport-github2').Strategy;
const LocalStrategy = require('passport-local').Strategy;

const configAuth = require('./auth');

module.exports = (passport, db) => {
  // passport session setup ==================================================
  // required for persistent login sessions
  // passport needs ability to serialize and unserialize users out of session

  passport.serializeUser((user, done) => done(null, user));
  passport.deserializeUser((obj, done) => done(null, obj));


  const githubCredentials = {
    clientID: configAuth.githubAuth.GITHUB_CLIENT_ID,
    clientSecret: configAuth.githubAuth.GITHUB_CLIENT_SECRET,
    callbackURL: configAuth.githubAuth.GITHUB_CALLBACK_URL
  }

  // GITHUB AUTHENTICATION
  passport.use(new GitHubStrategy(githubCredentials, gitHubLogin));

  function gitHubLogin(accessToken, refreshToken, profile, done) {

    const queryString = `select ud.*, roles.name as rolename from user_details as ud, roles
                      where ud.login = '${profile._json.login}'
                      and roles.id = ud.role_id`;

    const setUserProfile = (user) => {
      user.token = accessToken;
      process.nextTick(() => done(null, user));
    }

    db.one(queryString, [true])
      .then(setUserProfile)
      .catch((err) => onError(err, res));
  }

  // LOCAL LOGIN
  passport.use(new LocalStrategy(co.wrap(localLogin)));

  function* localLogin(username, password, next) {
    try {
      const queryString = `SELECT ud.*, roles.name AS rolename from user_details AS ud, roles 
                            WHERE (ud.login = \${username}
                            AND ud.password = \${password})
                            AND roles.id = ud.role_id;`;

      const user = yield db.one(queryString, { username, password });

      return next(null, user);
    } catch (e) {
      next(e);
    }
  }

}

