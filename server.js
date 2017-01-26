'use strict'

const passport = require('passport');
const express = require('express');
const bodyParser = require('body-parser');
const partials = require('express-partials');
const methodOverride = require('method-override');
const session = require('express-session');

let db = require('./config/database')().connectDatabase();

require('./config/passport.js')(passport, db);

// configure Express
let app = express();
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(methodOverride());

app.use(session({ secret: 'adam alinoe', resave: false, saveUninitialized: false }));

app.use(passport.initialize());
app.use(passport.session()); //persistent login sessions
app.use(express.static(__dirname + '/public'));

require('./app/routes.js')(app, passport, db);

app.listen(3000);
