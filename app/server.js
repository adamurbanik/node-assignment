'use strict'

let util = require('util');
let express = require('express');
let passport = require('passport');
let GitHubStrategy = require('passport-github2').Strategy;
let LocalStrategy = require('passport-local').Strategy;
let bodyParser = require('body-parser');
let partials = require('express-partials');
let methodOverride = require('method-override');
let session = require('express-session');
let request = require('request');
let http = require('http');
let coForEach = require('co-foreach');
let Q = require('q');
var co = require('co');
let RequestClient = require('./requestService');
let requestClient = new RequestClient();
let User = require('./user.js');
let DBService = require('./dbService');
let dbService = new DBService();

const ensureAuthenticated = require('./middlewares/ensureAuthenticated');


let GITHUB_CLIENT_ID = '5301c2ab0614cc72f15c';
let GITHUB_CLIENT_SECRET = 'be52db4573cf12873a57117e59848307e0f0a37d';

passport.serializeUser((user, done) => done(null, user));

passport.deserializeUser((obj, done) => done(null, obj));

passport.use(new GitHubStrategy({
  clientID: GITHUB_CLIENT_ID,
  clientSecret: GITHUB_CLIENT_SECRET,
  callbackURL: "http://127.0.0.1:3000/auth/github/callback"
},
  (accessToken, refreshToken, profile, done) => {

    let queryString = `select ud.*, roles.name as rolename from user_details as ud, roles
                      where ud.login = '${profile._json.login}'
                      and roles.id = ud.role_id`;
  
    const setUserProfile = (user) => {
      user.token = accessToken;
      process.nextTick(() => {
        return done(null, user);
      });
    }
 
    dbService.queryDatabase(queryString)
      .then(setUserProfile); 
  }
));

passport.use(new LocalStrategy( co.wrap(function*(username, password, done) {

  let queryString = `SELECT ud.*, roles.name as rolename from user_details as ud, roles 
      where (ud.login = '${username}'
      and ud.password = '${password}')
      and roles.id = ud.role_id;`

  let result = yield dbService.queryDatabase(queryString);
  let user = result[0];
  printMessage(user);

  if (!user) return done(null, false);

  return done(null, user);

})));


// configure Express
var app = express();
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(methodOverride());

app.use(session({ secret: 'adam alinoe', resave: false, saveUninitialized: false }));

app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(__dirname + '/public'));

app.get('/', (req, res) => {
  req.session.user = req.user;

  const displayRepositories = (results) => {
    results = JSON.parse(results);
    res.render('index', { user: req.user, repositories: results});
  }

  try {
    requestClient.get(`https://api.github.com/repositories?since=364`)
      .then(displayRepositories)
  } catch (e) {
    printMessage('got error', e);
  }

});

app.get('/login', (req, res) => {
  let errorMessage = req.session.messages;
  req.session.messages = [];
  res.render('login', { login_errors: errorMessage || [] });
});

app.post('/login-user', 
  passport.authenticate('local', { 
    successRedirect: '/', 
    failureRedirect: '/login', 
    failureMessage: 'Invalid username or password' 
  })

);

app.get('/auth/github', passport.authenticate('github', { scope: ['user:email'] }), (req, res) => { /*tutaj nigdy nie bedziemy, idz do callback*/ });

app.get('/auth/github/callback', passport.authenticate('github', { failureRedirect: '/login' }), (req, res) => {
  res.redirect('/');
});

app.get('/account', ensureAuthenticated, co.wrap(function* (req, res) {
  const user = req.session.user;

  let queryPackages = `SELECT * FROM packages`;
  let queryUserPackages = `SELECT packages.name FROM packages, user_details
                          WHERE packages.id = user_details.package_id
                          AND user_details.id = ${user.id};`

  try {  
    let packages = yield Promise.resolve(dbService.queryDatabase(queryPackages));
    let userPackages = yield Promise.resolve(dbService.queryDatabase(queryUserPackages));
    res.render('account', { user, title: 'Moje konto', roleName: user.rolename, packages: packages, userPackages: userPackages });

  }  
  catch(e) {
    res.send(e);
    printMessage('got error' ,e);
  }

}));

app.post('/account/acquire-package', ensureAuthenticated, co.wrap(function*(req, res) {
  let formDetails = req.body;
  let user = req.session.user;
  printMessage('formDetails', formDetails);

  try {
    let queryString = `UPDATE user_details set package_id = ${formDetails.package_id}`;
    yield dbService.queryDatabase(queryString);
    res.send(`user ${user.login} acquired package ${formDetails.package_id}`)    
  }
  catch (e) {
    res.send(e);
    printMessage('got error', e);
  }

}));

app.get('/repositories', ensureAuthenticated, (req, res) => {

  const user = req.session.user;
  printMessage(user);

  const storeRepositories = (body) => {
    let repositories = JSON.parse(body);

    coForEach(repositories, function* (item, index) {
      let queryString = `INSERT INTO repositories (user_id, git_project_id, project_name, full_project_name, html_url, description, api_url)
        SELECT '${user.id}', '${item.id}','${item.name}', '${item.full_name}', '${item.html_url}', '${item.description}', '${item.url}'
        ON CONFLICT (git_project_id) DO UPDATE
        SET project_name='${item.name}', full_project_name='${item.full_name}', html_url='${item.html_url}', description='${item.description}', api_url='${item.url}';`

      yield dbService.queryDatabase(queryString);

    })
    res.render('repositories', { repositories: repositories });
  }

  try {
    requestClient.get(`https://api.github.com/users/${user.login}/repos`)
      .then(storeRepositories)
  } catch (e) {
    printMessage('got error', e);
  }

});


app.get(`/repositories/issues/:name`, ensureAuthenticated, (req, res) => {

  const user = req.session.user;

  const storeIssues = (body) => { 
    let issues = JSON.parse(body); 
    printMessage(issues);

    coForEach(issues, function* (item, index) {
      let queryString = `INSERT INTO issues (url, repository_url, git_issue_id, title, user_id, body)
        SELECT '${item.url}', '${item.repository_url}', ${item.id}, '${item.title}', ${user.id}, '${item.body}'
        ON CONFLICT (git_issue_id) DO UPDATE
        SET url='${item.url}', repository_url='${item.repository_url}', git_issue_id='${item.id}', title='${item.title}', user_id='${user.id}', body='${item.body}'`;

      yield dbService.queryDatabase(queryString);

    })
    res.render('issues', { issues: issues })
  }

  try {
    requestClient.get(`https://api.github.com/repos/${user.login}/${req.params.name}/issues`)
      .then(storeIssues);

  } catch (e) {
    printMessage('got error', e);
  }

});

app.get(`/packages`, ensureAuthenticated, co.wrap(function*(req, res) { 
  
  try {
    let packages = [];
    let queryString = `SELECT * FROM packages;`
    yield dbService.queryDatabase(queryString)
      .then((array) => array.forEach((item) => packages.push(item)));

    printMessage('packages', packages.length);
    res.render('packages', {packages: packages});
  }
  catch(e) {
    res.send(e);
    printMessage('got error', e);
  }
  
}));

app.post(`/create-package`, ensureAuthenticated, co.wrap(function*(req, res){

  let formDetails = req.body;
  let queryString = `INSERT INTO public.packages (name, price) VALUES('${formDetails.name}', ${formDetails.price});`;

  try {
    yield dbService.queryDatabase(queryString);
    res.send('package succesfully added');
  }
  catch (e) {
    res.send(e);
    printMessage('got error', e);
  }

}));


app.get('/logout', (req, res) => {
  req.logout();
  res.redirect('/');
});

app.listen(3000);

function printMessage(name, obj) {
  console.dir(name, { depth: null, colors: true });
  if (obj) console.dir(obj, { depth: null, colors: true });

}

const onError = (res) => {
  printMessage('onError', res);
};

