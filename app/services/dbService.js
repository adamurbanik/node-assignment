'use strict'

let pg = require('pg');

class DBService {
  constructor() {
    this.connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost/githubDB';

  }

  queryDatabase(queryString) {
    return new Promise((resolve, reject) => {
      let resultQuery = [];
      this.client = new pg.Client(this.connectionString);
      this.client.connect();

      const query = this.client.query(queryString, (err, result) => {
        if (err) { reject(queryString + err); }
      });
      query.on('row', (row) => {
        resultQuery.push(row);
      })
      query.on('end', () => {
        this.client.end();
        resolve(resultQuery);
      })
    })
  }
}

module.exports = DBService;


