'use strict'

const pgp = require('pg-promise')();

function DatabaseSetup() {

  function connectDatabase() {
    return pgp('postgresql://postgres:postgres@localhost/githubDB');
  }

  return {
    connectDatabase: connectDatabase
  }

}


module.exports = DatabaseSetup;
