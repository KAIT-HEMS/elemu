/* ----------------------------------------------------------------------------
* elemu-webapi.js
* ELエミュレーターの WebAPI に関連する機能を提供する
* -------------------------------------------------------------------------- */
'use strict';

/* ----------------------------------------------------------------------------
* Constructor: ElemuWebApi()
* -------------------------------------------------------------------------- */
function ElemuWebApi() {

}

/* ----------------------------------------------------------------------------
* getLang()
* 言語を取得する
* GET /system/lang
*
* 引数
*   なし
*
* 戻値
*   Promise オブジェクト
*   - resolve() には以下のオブジェクトが引き渡される:
*
* {
*   "result": 0,
*   "data": {
*     "lang": "ja"
*   }
* }
* -------------------------------------------------------------------------- */
ElemuWebApi.prototype.getLang = function () {
	return this.request({
		method: 'get',
		path: '/api/system/lang'
	});
};


/* ----------------------------------------------------------------------------
* setLang(p)
* 言語をセットする
* PUT /system/lang
*
* 引数
* - p         | Object  | required |
*   - lang    | String  | required | "ja", "en" のいずれか
*
* 戻値
*   Promise オブジェクト
*   - resolve() には以下のオブジェクトが引き渡される:
*
* {
*   "result": 0,
*   "data": {
*     "lang": "ja"
*   }
* }
* -------------------------------------------------------------------------- */
ElemuWebApi.prototype.setLang = function (p) {
	return this.request({
		method: 'put',
		path: '/api/system/lang',
		body: p
	});
};

/* ----------------------------------------------------------------------------
* getPowerStatus(p)
* デバイスの電源状態を取得する
* - GET /device/power
*
* 引数
*   なし
*
* 戻値
*   Promise オブジェクト
*   - resolve() には以下のオブジェクトが引き渡される:
*
* {
*   "result": 0,
*   "data": {
*     "powerStatus": true
*   }
* }
* -------------------------------------------------------------------------- */
ElemuWebApi.prototype.getPowerStatus = function () {
	return this.request({
		method: 'get',
		path: '/api/device/power',
	});
};

/* ----------------------------------------------------------------------------
* setPowerStatus(p)
* デバイスの電源状態をセットする
* - POST   /device/power
* - DELETE /device/power
*
* 引数
* - p              | Object  | required |
*   - powerStatus  | Boolean | required | true or false
*
* 戻値
*   Promise オブジェクト
*   - resolve() には以下のオブジェクトが引き渡される:
*
* {
*   "result": 0,
*   "data": {
*     "powerStatus": true
*   }
* }
* -------------------------------------------------------------------------- */
ElemuWebApi.prototype.setPowerStatus = function (p) {
	let status = p['powerStatus'];
	if (status) {
		return this.request({
			method: 'post',
			path: '/api/device/power',
		});
	} else {
		return this.request({
			method: 'delete',
			path: '/api/device/power',
		});
	}
};

/* ----------------------------------------------------------------------------
* getDeviceEojs()
* デバイス EOJ 一覧取得
* GET /api/device/eojs
*
* 引数
*   なし
*
* 戻値
*   Promise オブジェクト
*   - resolve() には以下のオブジェクトが引き渡される:
*
* {
*   "result": 0,
*   "data": {
*     "eojList": [
*       {
*         "eoj": "0EF001",
*         "epc": ["80", "81", "82", ...],
*         "release": "A"
*       },
*       {
*         "eoj": "05FF01",
*         "epc": ["80", "81", "82", ...],
*         "release": "L"
*       }
*     ]
*   }
* }
* -------------------------------------------------------------------------- */
ElemuWebApi.prototype.getDeviceEojs = function () {
	return this.request({
		method: 'get',
		path: '/api/device/eojs'
	});
};

/* ----------------------------------------------------------------------------
* deleteDeviceEoj(eoj)
* デバイス EOJ 一覧取得
* DELETE /api/device/eojs/{eoj}
*
* 引数
*  - eoj | EOJ (例: "05FF01")
*
* 戻値
*   Promise オブジェクト
*   - resolve() には以下のオブジェクトが引き渡される:
*
* {
*   "result": 0,
*   "data": {
*     "eoj": "05FF01",
*     "epc": ["80", "81", "82", ...]
*   }
* }
* -------------------------------------------------------------------------- */
ElemuWebApi.prototype.deleteDeviceEoj = function (eoj) {
	return this.request({
		method: 'delete',
		path: '/api/device/eojs/' + eoj
	});
};

/* ----------------------------------------------------------------------------
* addDeviceEoj(eoj, release)
* デバイス EOJ 新規登録
* POST /api/device/eojs
*
* 引数
*  - eoj     | EOJ (例: "05FF01")
*  - release | リリースバージョン (例: "J")
*
* 戻値
*   Promise オブジェクト
*   - resolve() には以下のオブジェクトが引き渡される:
*
* {
*   "result": 0,
*   "data": {
*     "eoj": "05FF01",
*     "epc": ["80", "81", "82", ...],
*     "release": "J"
*   }
* }
* -------------------------------------------------------------------------- */
ElemuWebApi.prototype.addDeviceEoj = function (eoj, release) {
	return this.request({
		method: 'post',
		path: '/api/device/eojs',
		body: {
			eoj: eoj,
			release: release
		}
	});
};

/* ----------------------------------------------------------------------------
* updateDeviceEoj(eoj, release, epc_list)
* デバイス EOJ 更新
* PUT /api/device/eojs
*
* 引数
*  - eoj      | EOJ (例: "05FF01")
*  - release  | リリースバージョン (例: "J")
*  - epc_list | サポートしたい EPC のリスト (例: ["80", "81", ...])
*
* 戻値
*   Promise オブジェクト
*   - resolve() には以下のオブジェクトが引き渡される:
*
* {
*   "result": 0,
*   "data": {
*     "eoj": "05FF01",
*     "epc": ["80", "81", "82", ...],
*     "release": "J"
*   }
* }
* -------------------------------------------------------------------------- */
ElemuWebApi.prototype.updateDeviceEoj = function (eoj, release, epc_list) {
	return this.request({
		method: 'put',
		path: '/api/device/eojs/' + eoj,
		body: {
			release: release,
			epc: epc_list
		}
	});
};

/* ----------------------------------------------------------------------------
* updateDeviceEdt(eoj, epc, edt)
* EDT 更新
* PUT /api/device/eojs/{eoj}/epcs/{epc}
*
* 引数
*  - eoj      | EOJ (例: "05FF01")
*  - epc      | EPC (例: "80")
*  - edt      | EDT (例: "30")
*
* 戻値
*   Promise オブジェクト
*   - resolve() には以下のオブジェクトが引き渡される:
*
* {
*   "result": 0,
*   "data": {
*     "changed": {
*       "80": "30"
*     }
*   }
* }
* -------------------------------------------------------------------------- */
ElemuWebApi.prototype.updateDeviceEdt = function (eoj, epc, edt) {
	return this.request({
		method: 'put',
		path: '/api/device/eojs/' + eoj + '/epcs/' + epc,
		body: {
			edt: edt
		}
	});
};

/* ----------------------------------------------------------------------------
* getReleaseVersionList()
* 有効なリリースバージョンのリストを取得
* GET /api/deviceDescriptions/releases
*
* 引数
*   なし
*
* 戻値
*   Promise オブジェクト
*   - resolve() には以下のオブジェクトが引き渡される:
*
* {
*   "result": 0,
*   "data": {
*     "releaseList": ["A", "B", ..., "J"]
*   }
* }
* -------------------------------------------------------------------------- */
ElemuWebApi.prototype.getReleaseVersionList = function () {
	return this.request({
		method: 'get',
		path: '/api/deviceDescriptions/releases'
	});
};

/* ----------------------------------------------------------------------------
* getDevcieDescriptionDeviceList()
* DeviceDescription に定義されているデバイスの一覧を取得
* GET /api/deviceDescriptions
*
* 引数
*   なし
*
* 戻値
*   Promise オブジェクト
*   - resolve() には以下のオブジェクトが引き渡される:
*
* {
*   "result": 0,
*   "data": {
*     "deviceList": [
*       {
*         "eoj": "000D",
*         "className": {
*           "ja": "照度センサ",
*           "en": "Illuminance Sensor"
*         },
*         "firstRelease": "A"
*       },
*       ...
*     ]
*   }
* }
* -------------------------------------------------------------------------- */
ElemuWebApi.prototype.getDevcieDescriptionDeviceList = function () {
	return this.request({
		method: 'get',
		path: '/api/deviceDescriptions'
	});
};

/* ----------------------------------------------------------------------------
* getDevcieDescriptionDevice(eoj[, release])
* DeviceDescription に定義されているデバイス情報を取得
* GET /api/deviceDescriptions/{eoj}
* GET /api/deviceDescriptions/{eoj}/{release}
*
* 引数
*   EOJ (クラスコード) (例: "0130")
*
* 戻値
*   Promise オブジェクト
*   - resolve() には以下のオブジェクトが引き渡される:
*
* {
*   "result": 0,
*   "data": {
*     "device": {
*       "eoj": "000D",
*       "className": {
*         "ja": "照度センサ",
*         "en": "Illuminance Sensor"
*       },
*       "firstRelease": "A",
*       "elProperties": [
*         {
*           "epc": "80",
*           "propertyName": {
*             "ja": "動作状態",
*             "en": "Operation status"
*           },
*           ...
*         },
*         ...
*       ]
*     }
*   }
* }
* -------------------------------------------------------------------------- */
ElemuWebApi.prototype.getDevcieDescriptionDevice = function (eoj, release) {
	let path = '/api/deviceDescriptions/' + eoj;
	if(release) {
		path += '/' + release.toUpperCase();
	}
	return this.request({
		method: 'get',
		path: path
	});
};

/* ----------------------------------------------------------------------------
* sendPacket(data)
* パケットを送信する
* POST /api/device/packet
*
* 引数
*   - data:
*     {
*       "address": "string",
*       "packet": {
*         "tid": 0,
*         "seoj": "string",
*         "deoj": "string",
*         "esv": "60",
*         "properties": [
*           {
*             "epc": "string",
*             "edt": "string"
*           }
*         ]
*       }
*     } 
*
* 戻値
*   Promise オブジェクト
*   - resolve() には以下のオブジェクトが引き渡される:
*
* {
*   "result": 0,
* }
* -------------------------------------------------------------------------- */
ElemuWebApi.prototype.sendPacket = function (data) {
	return this.request({
		method: 'post',
		path: '/api/device/packet',
		body: data
	});
};

/* ----------------------------------------------------------------------------
* getSystemConfigurations()
* システム設定情報取得
* GET /api/system/configurations
*
* 引数
*   なし
*
* 戻値
*   Promise オブジェクト
*   - resolve() には以下のオブジェクトが引き渡される:
*
* {
*   "result": 0,
*   "data": {
*     "lang": "ja",
*     "ip_address_version": 4,
*     "packet_log": true,
*     "packet_log_days": 0,
*     "multicast_response_wait_min_msec": 0,
*     "multicast_response_wait_max_msec": 0,
*     "get_res_wait_msec": 0,
*     "set_res_wait_msec": 0,
*     "inf_res_wait_msec": 0
*   }
* }
* -------------------------------------------------------------------------- */
ElemuWebApi.prototype.getSystemConfigurations = function () {
	return this.request({
		method: 'get',
		path: '/api/system/configurations'
	});
};

/* ----------------------------------------------------------------------------
* setSystemConfigurations(conf)
* システム設定情報保存
* PUT /api/system/configurations
*
* 引数
*   conf = {
*     "ip_address_version": 4,
*     "packet_log": true,
*     "packet_log_days": 0,
*     "multicast_response_wait_min_msec": 0,
*     "multicast_response_wait_max_msec": 0,
*     "get_res_wait_msec": 0,
*     "set_res_wait_msec": 0,
*     "inf_res_wait_msec": 0
*   }
*
* 戻値
*   Promise オブジェクト
*   - resolve() には以下のオブジェクトが引き渡される:
*
* {
*   "result": 0,
*   "data": {
*     "lang": "ja",
*     "ip_address_version": 4,
*     "packet_log": true,
*     "packet_log_days": 0,
*     "multicast_response_wait_min_msec": 0,
*     "multicast_response_wait_max_msec": 0,
*     "get_res_wait_msec": 0,
*     "set_res_wait_msec": 0,
*     "inf_res_wait_msec": 0
*   }
* }
* -------------------------------------------------------------------------- */
ElemuWebApi.prototype.setSystemConfigurations = function (conf) {
	return this.request({
		method: 'put',
		path: '/api/system/configurations',
		body: conf
	});
};



/* ----------------------------------------------------------------------------
* getDeviceEpcs(eoj)
* デバイス EPC データ (EDT) 一括取得
* GET /api/device/eojs/{eoj}/epcs
*
* 引数
*   - eoj
*
* 戻値
*   Promise オブジェクト
* -------------------------------------------------------------------------- */
ElemuWebApi.prototype.getDeviceEpcs = function (eoj) {
	return this.request({
		method: 'get',
		path: '/api/device/eojs/' + eoj + '/epcs'
	});
};

/* ----------------------------------------------------------------------------
* resetSystem(eoj)
* システムリセット
* DELETE /api/device
*
* 引数
*   なし
*
* 戻値
*   Promise オブジェクト
* -------------------------------------------------------------------------- */
ElemuWebApi.prototype.resetSystem = function () {
	return this.request({
		method: 'delete',
		path: '/api/device'
	});
};

/* ----------------------------------------------------------------------------
* sendDiscoveryPacket()
* デバイス発見パケットを送信
* POST /api/controller/discovery
*
* 引数
*   なし
*
* 戻値
*   Promise オブジェクト
* -------------------------------------------------------------------------- */
ElemuWebApi.prototype.sendDiscoveryPacket = function () {
	return this.request({
		method: 'post',
		path: '/api/controller/discovery'
	});
};

/* ----------------------------------------------------------------------------
* deleteRemoteDevices()
* 発見済みリモートデバイスをクリア
* DELETE /api/controller/remoteDevices
*
* 引数
*   なし
*
* 戻値
*   Promise オブジェクト
* -------------------------------------------------------------------------- */
ElemuWebApi.prototype.deleteRemoteDevices = function () {
	return this.request({
		method: 'delete',
		path: '/api/controller/remoteDevices'
	});
};

/* ----------------------------------------------------------------------------
* getRemoteDeviceList()
* 発見済みリモートデバイス一覧取得
* GET /api/controller/remoteDevices
*
* 引数
*   なし
*
* 戻値
*   Promise オブジェクト
*   - resolve() には以下のオブジェクトが引き渡される:
*
* {
*   "result": 0,
*   "data": {
*     "remoteDeviceList": [
*       {
*         "address": "192.168.11.2",
*         "id": "FE00001BF0761C95FB1800000000000000",
*         "eojList": [
*           {
*             "eoj": "0EF001",
*             "className": {
*               "ja": "ノードプロファイル",
*               "en": "Node Profile"
*             },
*             "manufacturer": {
*               "code": "00001B",
*               "name": {
*                 "ja": "東芝ライテック株式会社",
*                 "en": "Toshiba Lighting & Technology"
*               }
*             },
*             "elProperties": [
*               {
*                 "epc": "80",
*                 "propertyName": {
*                   "ja": "動作状態",
*                   "en": "Operation status"
*                 },
*                 "map": {
*                   "get": true,
*                   "set": false,
*                   "inf": true
*                 },
*                 "data": null
*               },
*             }
*           ]
*         },
*         ...
*       }
*     ]
*   }
* }
* -------------------------------------------------------------------------- */
ElemuWebApi.prototype.getRemoteDeviceList = function () {
	return this.request({
		method: 'get',
		path: '/api/controller/remoteDevices'
	});
};

/* ----------------------------------------------------------------------------
* getRemoteDeviceEpcData(address, eoj, epc)
* リモートデバイスの EPC データ (EDT) の個別取得
*
* 引数
* - address | String  | required | IP アドレス
* - eoj     | String  | required | EOJ
* - epc     | String  | required | EPC
*
* 戻値
*   Promise オブジェクト
*   - resolve() にはレスポンスの JSON 文字列をパースしたオブジェクトが引き渡される。
*
* {
*   "result": 0,
*   "data": {
*     "elProperty": {
*       "hex": "800130",
*       "epc": {
*         "hex": "80",
*         "propertyName": {
*           "ja": "動作状態",
*           "en": "Operation status"
*         }
*       },
*       "pdc": {
*         "hex": "01",
*         "value": 1
*       },
*       "edt": {
*         "hex": "30",
*         "data": {
*           "type": "state",
*           "state": {
*             "ja": "ON",
*             "en": "ON"
*           }
*         },
*         "note": null
*       }
*     }
*   }
* }
* -------------------------------------------------------------------------- */
ElemuWebApi.prototype.getRemoteDeviceEpcData = function (address, eoj, epc) {
	return this.request({
		method: 'get',
		path: '/api/controller/remoteDevices/' + address + '/eojs/' + eoj + '/epcs/' + epc
	});
};

/* ----------------------------------------------------------------------------
* request(p)
* HTTP リクエストを送信しレスポンスを受ける
*
* 引数
* - p         | Object  | required |
*   - method  | String  | required | "get", "post", "put", "delete" のいずれか
*   - path    | String  | required | エンドポイントのパス (/ で始まらなければいけない)
*   - params  | Object  | optional | クエリストリングに入れるパラメータのハッシュオブジェクト
*   - body    | Object  | optional | リクエストボディに入れる JSON 文字列のもととなるハッシュオブジェクト
*   - timeout | Integer | optional | タイムアウト (ミリ秒)。デフォルトは 10000 (10 秒)。
*
* 戻値
*   Promise オブジェクト
*   - resolve() にはレスポンスの JSON 文字列をパースしたオブジェクトが引き渡される。
* -------------------------------------------------------------------------- */
ElemuWebApi.prototype.request = function (p) {
	let promise = new Promise(function (resolve, reject) {
		let method = p['method'].toLowerCase();
		let path = p['path'];
		let params = p['params'];
		let body = p['body'];
		let timeout = p['timeout'] || 10000;

		let url = this._createRequestUrl(path, params);
		let xhr = new XMLHttpRequest();
		xhr.open(method, url);
		xhr.responseType = 'json';
		xhr.setRequestHeader('Content-Type', 'application/json');
		if (method === 'get') {
			xhr.setRequestHeader('If-Modified-Since', 'Thu, 01 Jun 1970 00:00:00 GMT');
		}
		xhr.timeout = timeout;
		xhr.onload = function () {
			let o = xhr.response;
			if (xhr.status === 200) {
				resolve(o);
			} else {
				if (o && o['message']) {
					reject(new Error(o['message']));
				} else {
					reject(new Error(xhr.status + ' ' + xhr.statusText));
				}
			}
		}.bind(this);
		xhr.onerror = function () {
			reject(new Error('Network Error.'));
		}.bind(this);
		xhr.ontimeout = function () {
			reject(new Error('Timeout.'));
		}.bind(this);
		if (body) {
			xhr.send(JSON.stringify(body));
		} else {
			xhr.send();
		}
	}.bind(this));
	return promise;
};

ElemuWebApi.prototype._createRequestUrl = function (path, params) {
	let url = path;
	let query_string = this._createQueryString(params);
	if (query_string) {
		url += '?' + query_string;
	}
	return url;
};

ElemuWebApi.prototype._createQueryString = function (params) {
	if (params && typeof (params) === 'object' && Object.keys(params).length > 0) {
		let pair_list = [];
		for (let k in params) {
			pair_list.push(k + '=' + encodeURIComponent(params[k]));
		}
		return pair_list.join('&');
	} else {
		return '';
	}
};

