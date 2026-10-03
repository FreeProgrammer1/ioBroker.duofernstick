'use strict';
const path = require('node:path');
const { tests } = require('@iobroker/testing');

// Validiert package.json und io-package.json gegen die ioBroker-Vorgaben.
tests.packageFiles(path.join(__dirname, '..'));
