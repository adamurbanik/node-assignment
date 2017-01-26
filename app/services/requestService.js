'use strict'

const request = require('request');

function RequestClient() {

  function get(url) {
    return new Promise((resolve, reject) => {
      request({
        headers: { 'user-agent': 'node.js' },
        uri: url,
        method: 'GET'
      }, (error, response, body) => {
        if (error) reject(error);
        resolve(body);
      })

    })
  }

  return {
    get: get
  }
}

module.exports = RequestClient;

