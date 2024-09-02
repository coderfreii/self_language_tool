try {
	module.exports = require('./out/main');
} catch (e) {
	module.exports = require('./dist/client');
}
