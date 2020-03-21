const Slimbot = require('slimbot');
const Agent = require('./socksAgent.js');
const Request = require('request-promise');

// hack for handling bad proxies (see https://github.com/mattcg/socks5-https-client/issues/21)
// and probing ipv6 connectivity
class SlimbotImproved extends Slimbot {
  constructor(token, host, proxy) {
	super(token, proxy);
	if (host) this._host = host;
	this._useV6 = false;
	this._probeV6 = true;
  }
  _request(method, params, formData) {
	if (arguments.length === 0 || typeof arguments[0] !== 'string') {
	  throw new Error('Please provide method as a string');
	}
	// ipv6 state for this exact request
	let useV6 = this._useV6;
	// the 2nd, 3rd or 4th argument could be a callback
	let callback;
	if (typeof arguments[3] == 'function') {
	  callback = arguments[3];
	} else if (typeof arguments[2] == 'function') {
	  callback = arguments[2];
	  formData = null;
	} else if (typeof arguments[1] == 'function') {
	  callback = arguments[1];
	  params = null;
	}
	let options = {
	  uri: (this._host || 'https://api.telegram.org') + '/bot' + this._token + '/' + method,
	  qs: params,
	  formData: formData,
	  simple: false,
	  resolveWithFullResponse: true,
	  forever: true,
	  family: useV6 ? 6 : 4,
	  timeout: 15e3
	};
	if(this._useProxy){
	  options.strictSSL = true;
	  options.agentClass = Agent;
	  options.agentOptions = {
		socksHost: this._proxy.socksHost,
		socksPort: this._proxy.socksPort
	  };
	  options.pool = {maxSockets: Infinity}; // we can get stuck with the broken proxy otherwise
	  if(this._proxy.socksUsername && this._proxy.socksPassword){
		options.agentOptions.socksUsername = this._proxy.socksUsername;
		options.agentOptions.socksPassword = this._proxy.socksPassword;
	  }
	}
	return Request(options)
	.then(resp => {
	  if (resp.statusCode !== 200) {
		throw new Error(resp.statusCode + ':\n'+ resp.body);
	  }
	  let updates = JSON.parse(resp.body);
	  if (updates.ok) {
		if (this._probeV6) {
		  this._probeV6 = false;
		  this._useV6 = useV6;
		  console.log(new Date(),'tgBot: probeV6 finished with: ' + (useV6 ? 'v6' : 'v4'));
		}
		if (callback) {
		  callback(null, updates);
		}
		return updates;
	  }
	  return null;
	})
	.catch(error => {
	  if (this._probeV6) {
		this._useV6 = !this._useV6;
	  }
	  if (callback) {
		callback(error);
	  }
	  else {
		throw error;
	  }
	});
  }
}
module.exports = SlimbotImproved;