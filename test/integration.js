'use strict';
const path = require('node:path');
const { tests } = require('@iobroker/testing');

// Startet den Adapter in einer echten js-controller-Testumgebung.
// Ohne konfigurierten seriellen Port muss der Adapter sauber starten und weiterlaufen.
tests.integration(path.join(__dirname, '..'));
