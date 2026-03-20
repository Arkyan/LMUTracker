const { app } = require('electron');

const devLog = (...args) => {
  if (!app.isPackaged) {
    console.log(...args);
  }
};

module.exports = devLog;
