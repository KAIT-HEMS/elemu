/* ------------------------------------------------------------------
* InitValues.js
* 初期値データ JSON initValues.json を扱うモジュール
*
* - initValues.json を扱いやすいように以下の通りに変換
*   - devices を array から eoj をキーにした object に変換
*   - 0xFF を FF に変換 (0x の削除)
* - EOJ を指定したら、それに該当するデータを返す
*   - common をマージする
* ---------------------------------------------------------------- */
'use strict';
const mPath = require('path');

class InitValues {
  constructor() {
    this._common = {};
    this._devices = {};
    this._caches = {};
  }

  /* ------------------------------------------------------------------
  * Method: init()
  * ---------------------------------------------------------------- */
  init() {
    // initValues.jsonを読み込む
    let json_path = mPath.resolve(__dirname, '../conf/initValues.json');
    let data = require(json_path);
    // common の変換
    let common = data['common'];
    if (common && typeof (common) === 'object') {
      let vals = this._getInitValues(common);
      if (vals) {
        this._common = vals;
      }
    }
    // devices の変換
    let dev_list = data['devices'];
    if (dev_list && Array.isArray(dev_list) && dev_list.length > 0) {
      let devs = {};
      dev_list.forEach((dev) => {
        if (!dev || typeof (dev) !== 'object') {
          return;
        }
        let eoj = dev['eoj'];
        if (!eoj || typeof (eoj) !== 'string' || !/^0x[0-9a-fA-F]{4}$/.test(eoj)) {
          return;
        }
        eoj = eoj.replace(/^0x/, '').toUpperCase();
        let vals = this._getInitValues(dev);
        if (vals) {
          devs[eoj] = vals;
        }
      });
      this._devices = devs;
    }
  }

  _getInitValues(dev) {
    let o = dev['initValues'];
    if (!o || typeof (o) !== 'object' || Object.keys(o).length === 0) {
      return null;
    }
    let vals = {};
    for (let epc in o) {
      if (!/^0x[0-9a-fA-F]{2,}$/.test(epc)) {
        continue;
      }
      let vlist = o[epc];
      epc = epc.replace(/^0x/, '').toUpperCase();
      if (epc.length % 2 !== 0) {
        continue;
      }
      if (!vlist || !Array.isArray(vlist) || vlist.length === 0) {
        continue;
      }
      let new_vlist = [];
      for (let i = 0; i < vlist.length; i++) {
        let v = vlist[i];
        if (typeof (v) === 'string') {
          if (/^0x[0-9a-fA-F]{2,}$/.test(v) && v.length % 2 === 0) {
            v = v.replace(/^0x/, '').toUpperCase();
            new_vlist.push(v);
          }
        } else if (typeof (v) === 'number') {
          if (v === 0 || v === 1) {
            new_vlist.push(v);
          }
        }
      }
      if (new_vlist.length > 0) {
        vals[epc] = new_vlist;
      }
    }
    return vals;
  }

  /* ------------------------------------------------------------------
  * Method: get(eoj)
  * ---------------------------------------------------------------- */
  get(eoj) {
    if (!eoj || typeof (eoj) !== 'string' || !/^[0-9a-fA-F]{4,}$/.test(eoj)) {
      return null;
    }
    eoj = eoj.substring(0, 4).toUpperCase();

    // 指定の EOJ のデータを検索
    if (!(eoj in this._devices)) {
      return null;
    }

    // キャッシュを検索
    let vals = null;
    if (this._caches[eoj]) {
      vals = this._caches[eoj];
    } else {
      vals = JSON.parse(JSON.stringify(this._devices[eoj]));
      // common のデータをマージ
      Object.keys(this._common).forEach((epc) => {
        if (!vals[epc]) {
          let vlist = JSON.parse(JSON.stringify(this._common[epc]));
          vals[epc] = vlist;
        }
      });
      this._caches[eoj] = JSON.parse(JSON.stringify(vals));
    }

    return vals;
  }
}

const mInitValues = new InitValues();
mInitValues.init();
module.exports = mInitValues;
