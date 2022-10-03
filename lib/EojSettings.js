/* ------------------------------------------------------------------
* EojSettings.js
* eojSettings.json のデータを扱うモジュール
*
* - eojSettings.json を扱いやすいように以下の通りに変換
*   - 0xFF を FF に変換 (0x の削除)
* - EOJ を指定したら、それに該当するデータを返す
* ---------------------------------------------------------------- */
'use strict';
const mPath = require('path');
const mFs = require('fs');

class EojSettings {
  constructor() {
    this._eojs = {};
  }

  /* ------------------------------------------------------------------
  * init()
  * ---------------------------------------------------------------- */
  init() {
    // JSON を読み込む
    let json_fpath = mPath.resolve(__dirname, '../conf/eojSettings.json');
    let list = [];
    if (mFs.existsSync(json_fpath)) {
      try {
        list = require(json_fpath);
      } catch (error) {
        throw new Error('[eojSettings.json] JSON format error: ' + error.message);
      }
      if (!list || !Array.isArray(list)) {
        throw new Error('[eojSettings.json] JSON format error: ' + json_fpath);
      }
    }
    // EOJ の `0x` を削除する
    let eojs = {};
    list.forEach((data) => {
      let eoj_hex = data['eoj'];
      if (!eoj_hex || typeof (eoj_hex) !== 'string' || !/^0x[0-9A-Fa-f]{6}$/.test(eoj_hex)) {
        throw new Error('[eojSettings.json] Invalid EOJ: ' + eoj_hex);
      }
      eoj_hex = eoj_hex.replace(/^0x/, '').toUpperCase();

      let plist = data['elProperties'];
      if (!plist || !Array.isArray(plist)) {
        throw new Error('[eojSettings.json] The `elProperties` property is invalid.');
      }
      let props = {};
      plist.forEach((p) => {
        // epc のチェック
        let epc_hex = p['epc'];
        if (!epc_hex || typeof (epc_hex) !== 'string' || !/^0x[0-9A-Fa-f]{2}$/.test(epc_hex)) {
          throw new Error('[eojSettings.json] Invalid EPC: ' + epc_hex);
        }
        epc_hex = epc_hex.replace(/^0x/, '').toUpperCase();

        // propertyMap のチェック
        let pmap = p['propertyMap'];
        if (pmap && typeof (pmap) === 'object') {
          let get = null;
          if (('get' in pmap) && typeof (pmap['get']) === 'boolean') {
            get = pmap['get'];
          }
          let set = null;
          if (('set' in pmap) && typeof (pmap['set']) === 'boolean') {
            set = pmap['set'];
          }
          let inf = null;
          if (('inf' in pmap) && typeof (pmap['inf']) === 'boolean') {
            inf = pmap['inf'];
          }
          if (get === null && set === null && inf === null) {
            pmap = null;
          }
        }

        // responseTime のチェック
        let rt = p['responseTime'];
        if (rt && typeof (rt) === 'object') {
          let get = null;
          if (('get' in rt) && typeof (rt['get']) === 'number') {
            get = rt['get'];
          }
          let set = null;
          if (('set' in rt) && typeof (rt['set']) === 'number') {
            set = rt['set'];
          }
          let inf = null;
          if (('inf' in rt) && typeof (rt['inf']) === 'number') {
            inf = rt['inf'];
          }
          if (get === null && set === null && inf === null) {
            rt = null;
          }
        }

        // settingTime のチェック
        let st = p['settingTime'];
        if (typeof (st) !== 'number') {
          st = null;
        }

        let o = {};
        if (pmap !== null) {
          o['propertyMap'] = pmap;
        }
        if (rt !== null) {
          o['responseTime'] = rt;
        }
        if (st !== null) {
          o['settingTime'] = st;
        }
        props[epc_hex] = o;

      });
      eojs[eoj_hex] = props;
    });
    this._eojs = eojs;
  }

  /* ------------------------------------------------------------------
  * get(eoj)
  * メーカーコードから該当のデータを返す
  *
  * 引数:
  * - eoj  | String | required | EOJ (例: `013001`)
  *
  * 戻値:
  * - 以下のハッシュオブジェクト (キーは EPC)
  *   {
  *     "80": {
  *       "propertyMap": {
  *         "get": false,
  *         "set": true,
  *         "inf": true
  *       },
  *       "responseTime": {
  *         "get": 1000,
  *         "set": 1500,
  *         "inf": 2000
  *       },
  *       settingTime: 3000
  *     },
  *     ...
  *   }
  *
  * - 上記すべてのプロパティがセットされているわけではなく、eojSettings.json
  *   に記述された情報だけが格納されている点に注意すること。
  * - もし該当の EOJ が見つからなければ、null を返す。
  * ---------------------------------------------------------------- */
  get(eoj) {
    if (!eoj || typeof (eoj) !== 'string' || !/^[0-9A-Fa-f]{6}$/.test(eoj)) {
      return null;
    }
    eoj = eoj.toUpperCase();
    let d = this._eojs[eoj];
    if (d) {
      return JSON.parse(JSON.stringify(d));
    } else {
      return null;
    }
  }
}

const mEojSettings = new EojSettings();
mEojSettings.init();
module.exports = mEojSettings;
