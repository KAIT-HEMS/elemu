/* ------------------------------------------------------------------
* ManufacturerTable.js
* manufacturerTable.json のデータを扱うモジュール
*
* - manufacturerTable.json を扱いやすいように以下の通りに変換
*   - 0xFF を FF に変換 (0x の削除)
* - メーカーコードを指定したら、それに該当するデータを返す
* ---------------------------------------------------------------- */
'use strict';
const mPath = require('path');

class ManufacturerTable {
  constructor() {
    this._manus = {};
  }

  /* ------------------------------------------------------------------
  * init()
  * ---------------------------------------------------------------- */
  init() {
    // JSON を読み込む
    let json_fpath = mPath.resolve(__dirname, '../conf/manufacturerCode.json');
    let obj = require(json_fpath);
    let o = obj['data'];
    // メーカーコードの `0x` を削除する
    let manus = {};
    Object.keys(o).forEach((mcode) => {
      let data = o[mcode];
      let code = mcode.replace(/^0x/, '').toUpperCase();
      manus[code] = data;
    });
    this._manus = manus;
  }

  /* ------------------------------------------------------------------
  * get(code)
  * メーカーコードから該当のデータを返す
  *
  * 引数:
  * - code  | String | required | メーカーコード (例: `0000FB`)
  *
  * 戻値:
  * - 以下のハッシュオブジェクト
  *   {
  *     "ja": "日本語のメーカー名",
  *     "en": "英語のメーカー名"
  *   }
  *
  *  - もし指定のメーカーコードが見つからなければ null を返す
  * ---------------------------------------------------------------- */
  get(code) {
    if (!code || typeof (code) !== 'string' || !/^[0-9A-Fa-f]{6}$/.test(code)) {
      return null;
    }
    let d = this._manus[code];
    if (d) {
      return JSON.parse(JSON.stringify(d));
    } else {
      return null;
    }
  }

  /* ------------------------------------------------------------------
  * getList()
  * 全メーカー情報をリストで返す
  *
  * 引数:
  *  - なし
  *
  * 戻値:
  * - 以下のハッシュオブジェクトを入れた配列
  *   [
  *     {
  *       "code : "メーカーコード (例: `0x0000FB`)",
  *       "name": {
  *         "ja": "日本語のメーカー名",
  *         "en": "英語のメーカー名"
  *       }
  *     },
  *     ...
  *   ]
  * ---------------------------------------------------------------- */
  getList() {
    let list = [];
    Object.keys(this._manus).sort().forEach((code) => {
      list.push({
        code: code,
        name: JSON.parse(JSON.stringify(this._manus[code]))
      });
    });
    return list;
  }
}


const mManufacturerTable = new ManufacturerTable();
mManufacturerTable.init();
module.exports = mManufacturerTable;
