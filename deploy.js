const moment = require('moment');
const execSync = require('child_process').execSync;

const dateTime = moment().format('DD/MM/YYYY HH:mm:ss');

execSync(`git add . && git commit -m \"Blog updated: ${dateTime}\" && git push - f`, { stdio: [0, 1, 2]} );
