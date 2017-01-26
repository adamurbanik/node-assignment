'use strict'

const co = require('co');
const coForEach = require('co-foreach');


const RequestClient = require('./services/requestService');
const requestClient = new RequestClient();
const DBService = require('./services/dbService');
const dbService = new DBService();

module.exports = function (app, passport, db) {

  //normal routes

  // show the home page
  app.get('/', co.wrap(getHome));
  app.get('/account', ensureAuthenticated, co.wrap(getAccount));
  app.post('/account/acquire-package', ensureAuthenticated, co.wrap(acquirePackage));
  app.get('/repositories', ensureAuthenticated, getRepositories);
  app.get(`/repositories/issues/:name`, ensureAuthenticated, getIssues);
  app.get(`/packages`, ensureAuthenticated, co.wrap(getPackages));
  app.post(`/create-package`, ensureAuthenticated, co.wrap(createPackage));


  function* getHome(req, res, next) {
    try {
      req.session.user = req.user;
      const results = yield requestClient.get(`https://api.github.com/repositories?since=364`);
      res.render('index', { user: req.user, repositories: JSON.parse(results) });
    } catch (e) {
      next(e);
    }
  }

  function* getAccount(req, res, next) {
    try {
      const user = req.session.user;

      const packages = yield db.many(`SELECT * FROM packages`);
      const userPackages = yield db.many(`SELECT packages.name  
                                          FROM packages, user_details  
                                          WHERE packages.id = user_details.package_id   
                                          AND user_details.id = \${id}`, { id: user.id });

      res.render('account', {
        user,
        packages,
        userPackages,
        title: 'Moje konto',
        roleName: user.rolename
      });
    } catch (e) {
      next(e);
    }
  }

  function* acquirePackage(req, res) {
    const formDetails = req.body;
    const user = req.session.user;

    const template = `user ${user.login} acquired package ${formDetails.package_id}`;
    const queryString = `UPDATE user_details set package_id = ${formDetails.package_id}`;

    db.none(queryString)
      .then(() => render(template, res))
      .catch((err) => onError(err, res));

  }

  function getRepositories(req, res) {

    const user = req.session.user;

    requestClient.get(`https://api.github.com/users/${user.login}/repos`)
      .then((body) => storeRepositories(body, user, res))
      .catch((err) => onError(err, res));
  }

  function storeRepositories (body, user, res) {
    let repositories = JSON.parse(body);

    db.tx((task) => {
      let queries = repositories.map((item) => {
        return task.none(`INSERT INTO repositories (user_id, git_project_id, project_name, full_project_name, html_url, description, api_url)
              SELECT '${user.id}', '${item.id}','${item.name}', '${item.full_name}', '${item.html_url}', '${item.description}', '${item.url}'
              ON CONFLICT (git_project_id) DO UPDATE
              SET project_name='${item.name}', full_project_name='${item.full_name}', html_url='${item.html_url}', description='${item.description}', api_url='${item.url}';`)
      })

      return task.batch(queries);
    })
      .then(() => res.render('repositories', { repositories: repositories }))
      .catch((err) => onError(err, res));
  }

  function getIssues(req, res) {

    const user = req.session.user;
    requestClient.get(`https://api.github.com/repos/${user.login}/${req.params.name}/issues`)
      .then((body) => storeIssues(body, user, res))
      .catch(onError);
  }

  function storeIssues(body, user, res) {
    let issues = JSON.parse(body);

    coForEach(issues, function* (item, index) {
      const queryString = `INSERT INTO issues (url, repository_url, git_issue_id, title, user_id, body)
          SELECT '${item.url}', '${item.repository_url}', ${item.id}, '${item.title}', ${user.id}, '${item.body}'
          ON CONFLICT (git_issue_id) DO UPDATE
          SET url='${item.url}', repository_url='${item.repository_url}', git_issue_id='${item.id}', title='${item.title}', user_id='${user.id}', body='${item.body}'`;

      return yield db.none(queryString)
        .catch((err) => onError(err, res))

    })
      .then(() => res.render('issues', { issues: issues }))
      .catch((err) => onError(err, res))

  }

  function* getPackages(req, res) {

    const queryString = `SELECT * FROM packages;`;
    yield dbService.queryDatabase(queryString)
      .then((array) => res.render('packages', { packages: array }))
      .catch((err) => onError(err, res));

  }

  function* createPackage(req, res) {

    const formDetails = req.body;
    const queryString = `INSERT INTO public.packages (name, price) VALUES('${formDetails.name}', ${formDetails.price});`;

    dbService.queryDatabase(queryString)
      .then(() => res.send('package succesfully added'))
      .catch((err) => onError(err, res));
  }


  function logout(req, res) {
    req.logout();
    res.redirect('/');
  }




  // logout
  app.get('/logout', logout);


  // AUTHENTICATE (FIRST LOGIN)

  // locally -------------------------
  // login    
  // show the login form
  app.get('/login', login);


  function login(req, res) {
    let errorMessage = req.session.messages;
    req.session.messages = [];
    res.render('login', { login_errors: errorMessage || [] });
  }


  // process the login form
  app.post('/login-user', passport.authenticate('local', {
    successRedirect: '/',
    failureRedirect: '/login',
    failureMessage: 'Invalid username or password'
  }));


  // github ------------------------

  // send to github for the authentication
  app.get('/auth/github', passport.authenticate('github', { scope: ['user:email'] }), (req, res) => { /*tutaj nigdy nie bedziemy, idz do callback*/ });


  // handle the callback after github authenticated user
  app.get('/auth/github/callback', passport.authenticate('github', {
    failureRedirect: '/login'
  }), (req, res) => {
    res.redirect('/');
  });

  app.use(co.wrap(appErrorHandler));

}

function* appErrorHandler(err, req, res, next) {
  printMessage('onError', err);
  res.send(err);
}

// route moddleware to ensure user is still logged in  
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  res.redirect('/login');
}

function printMessage(name, obj) {
  console.dir(name, { depth: null, colors: true });
  if (obj) {
    console.dir(obj, { depth: null, colors: true });
  }
}

function onError(e, res) {
  printMessage('onError', e);
  res.send(e);
};

function render(template, res) {
  res.send(template);
}

