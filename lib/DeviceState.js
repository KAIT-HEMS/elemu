/* ------------------------------------------------------------------
* DeviceState.js
* デバイスオブジェクトのEPC値の状態管理モジュール
* ---------------------------------------------------------------- */
'use strict';
const mFs = require('fs');
const mPath = require('path');
const mOs = require('os');

class DeviceState {
  /* ------------------------------------------------------------------
  * Constructor
  * ---------------------------------------------------------------- */
  constructor(eoj, desc, user_init_values, conf, standard_version, parser, eoj_settings) {
    this._eoj = eoj;
    this._desc = desc;
    this._user_init_values = user_init_values;
    this._conf = conf;
    this._standard_version = standard_version;
    this._parser = parser;
    this._eoj_settings = eoj_settings || {};
    /*
  this._eoj_settings  = {
    "80": {
    "propertyMap": {
      "get": false,
      "set": true,
      "inf": true
    },
    "responseTime": {
      "get": 1000,
      "set": 1500,
      "inf": 2000
    },
    "settingTime": {
      "get": 1000,
      "set": 1500,
      "inf": 2000
    }
    },
    ...
  }
    */

    // EPC ごとのプロパティマップ
    this._property_map = {};

    // 状態ファイルのパス
    this._fpath = mPath.resolve(__dirname, '../data/state_' + eoj + '.json');
    // 状態ファイルの保存中ロックフラグ
    this._flock = false;
    // 状態を保存したハッシュオブジェクト
    this._states = {};

    // 本モジュール内では、EDT は 16 進数表記で管理する。つまり、
    // EPC に対して一つの 16 進数文字列が割り当てられた状態で管理
    // される。
    // user_init_values も EPC に対して一つの 16 進数文字列に
    // 変換したうえで、初期状態に組み込まれる。

    // インスタンス生成時の UNIX 時間 (積算運転時間 (EPC: 0x9A) の算出に使う)
    this._init_time = 0;

    // 現在日時の差分 (ミリ秒)
    // EPC 0x97 現在時刻設定 と 0x98 現在年月日設定 の算出に使う
    this._time_diff = 0;

    // 値が変更されたときに呼び出すイベントハンドラ
    this.onchange = () => { };
  }

  /* ------------------------------------------------------------------
  * init()
  * 初期化する
  * ---------------------------------------------------------------- */
  init() {
    // EPC の初期値
    let vals = {};
    Object.keys(this._desc['elProperties']).forEach((epc) => {
      if (epc in this._user_init_values) {
        vals[epc] = this._user_init_values[epc].join('');
      } else {
        let p = this._desc['elProperties'][epc];
        // 初期値を設定する
        vals[epc] = this._getInitialHexValue(p['data']);
      }
    });

    // 個別の初期値を設定する
    this._setSpecialInitialHexValue(vals);
    // 状態保存情報をファイルから読み取って初期値に上書き
    let o = this._readStateFileSync();
    if (o) {
      Object.keys(o).forEach((k) => {
        if (k === '82') {
          // 規格Version情報は除外
          return;
        }
        vals[k] = o[k];
      });
    }
    this._states = vals;

    // プロパティマップをセットする
    this._setPropertyMaps();

    // 状態情報をファイルに保存する
    this._writeStateFileSync();

    // 起動タイムスタンプ (UNIX 時間: 秒)
    this._init_time = parseInt((Date.now() / 1000), 10);
  }

  // 初期値を確定する
  _getInitialHexValue(d) {
    if (!d) {
      return null;
    }

    if (d['oneOf'] && Array.isArray(d['oneOf']) && d['oneOf'].length > 0) {
      return this._getInitialHexValue(d['oneOf'][0]);
    }

    let type = d['type'];

    if (type === 'number') {
      // "minimum"が0または負の値の場合は0
      // "minimum"が正の値の場合は"minimum"の値
      let v = d['minimum'];
      if (v <= 0) {
        v = 0;
      }

      let format = d['format'];
      let buf = null;

      if (format === 'int8') {
        buf = Buffer.alloc(1);
        buf.writeInt8(v, 0);
      } else if (format === 'int16') {
        buf = Buffer.alloc(2);
        buf.writeInt16BE(v, 0);
      } else if (format === 'int32') {
        buf = Buffer.alloc(4);
        buf.writeInt32BE(v, 0);
      } else if (format === 'uint8') {
        buf = Buffer.alloc(1);
        buf.writeUInt8(v, 0);
      } else if (format === 'uint16') {
        buf = Buffer.alloc(2);
        buf.writeUInt16BE(v, 0);
      } else if (format === 'uint32') {
        buf = Buffer.alloc(4);
        buf.writeUInt32BE(v, 0);
      }

      if (buf) {
        return buf.toString('hex').toUpperCase();
      } else {
        return null;
      }
    } else if (type === 'state') {
      // edt の値の最小値
      let edt_list = [];
      d['enum'].forEach((o) => {
        let edt = o['edt'].replace(/^0x/, '');
        edt_list.push(edt);
      });
      if (edt_list.length > 0) {
        edt_list.sort();
        let min_edt = edt_list[0];
        return min_edt;
      } else {
        return null;
      }

    } else if (type === 'numericValue') {
      // numericValue の値の最小値
      let value_list = [];
      let value_edt_map = {};
      d['enum'].forEach((o) => {
        let edt = o['edt'].replace(/^0x/, '');
        let nv = o['numericValue'];
        value_list.push(nv);
        value_edt_map[nv] = edt;
      });
      if (value_list.length > 0) {
        value_list.sort((a, b) => a - b);
        let min = value_list[0];
        let min_edt = value_edt_map[min];
        return min_edt;
      } else {
        return null;
      }

    } else if (type === 'level') {
      // "base"の値
      let base = d['base'];
      if (base && typeof (base) === 'string') {
        let v = base.replace(/^0x/, '');
        return v;
      } else {
        return null;
      }
    } else if (type === 'bitmap') {
      // 全てのbitを0
      let size = 1;
      if (d['size']) {
        size = d['size'];
      }
      let hex = '';
      for (let i = 0; i < size; i++) {
        hex += '00';
      }
      return hex;
    } else if (type === 'date-time') {
      // エミュレータが起動した時点の日時
      let dt = new Date();
      let Y = Buffer.alloc(2);
      Y.writeUInt16BE(dt.getFullYear());
      let M = Buffer.from([dt.getMonth() + 1]);
      let D = Buffer.from([dt.getDate()]);
      let hms = Buffer.from([dt.getHours(), dt.getMinutes(), dt.getSeconds()]);
      let buf = Buffer.concat([Y, M, D, hms])
      let size = d['size'];
      if (size) {
        buf = buf.slice(0, size);
      }
      return buf.toString('hex').toUpperCase();
    } else if (type === 'date') {
      // エミュレータが起動した時点の日時
      let dt = new Date();
      let Y = dt.getFullYear();
      let M = dt.getMonth() + 1;
      let D = dt.getDate();
      let buf = Buffer.alloc(4);
      buf.writeUInt16BE(Y, 0);
      buf.writeUInt8(M, 2);
      buf.writeUInt8(D, 3);
      return buf.toString('hex').toUpperCase();
    } else if (type === 'time') {
      let size = d['size'];
      if (size === 1) {
        return '00';
      } else if (size === 2) {
        return '0000';
      } else {
        return '000000';
      }
    } else if (type === 'raw') {
      // 0x00
      // データサイズが可変の場合は、データサイズを最大値とする
      let size = d['maxSize'];
      let v = '';
      for (let i = 0; i < size; i++) {
        v += '00';
      }
      return v;
    } else if (type === 'array') {
      // 要素数が可変の場合は、要素数を最大値とする
      let n = d['maxItems'];
      let v = this._getInitialHexValue(d['items']);
      if (v) {
        let ary = [];
        for (let i = 0; i < n; i++) {
          ary.push(v);
        }
        return ary.join('');
      } else {
        return null;
      }
    } else if (type === 'object') {
      let props = d['properties'];
      if (props && typeof (props) === 'object') {
        let ary = [];
        props.forEach((p) => {
          let v = this._getInitialHexValue(p['element']);
          ary.push(v);
        });
        return ary.join('');
      } else {
        return null;
      }
    } else {
      return null;
    }
  }

  // 個別の初期値をセットする
  _setSpecialInitialHexValue(vals) {
    // 規格Version 情報 (EPC: 0x82) をセットする
    if (vals['82']) {
      if (/^0EF0/.test(this._eoj)) {
        vals['82'] = '010C0100'; // V1.12
      } else {
        const ver = (this._standard_version === 'A') ? 'a' : this._standard_version;
        let vhex = ver.charCodeAt(0).toString(16);
        vhex = ('0' + vhex).slice(-2).toUpperCase();
        vals['82'] = '0000' + vhex + '00';
      }
    }
    // 識別番号 (EPC: 0x83) をセットする
    if (vals['83']) {
      // MAC アドレスを使う
      let netifs = mOs.networkInterfaces();
      let mac_addr = '';
      for (let dev in netifs) {
        netifs[dev].forEach((info) => {
          if (info.internal || info.mac === '00:00:00:00:00:00') {
            return;
          }
          mac_addr = info.mac;
        });
      }
      if (!mac_addr) {
        console.error('MAC address was not determined.');
        process.exit();
      }
      mac_addr = mac_addr.replace(/\:/g, '').toUpperCase();
      let v = 'FE000077' + mac_addr + this._eoj;
      let pad_num = 34 - v.length;
      for (let i = 0; i < pad_num; i++) {
        v += '0';
      }
      vals['83'] = v;
    }
    // メーカ異常コード
    if (vals['86']) {
      vals['86'] = '0100007700';
    }
    // 異常発生状態	(EPC: 0x88) をセットする
    if (vals['88']) {
      vals['88'] = '42'; // 異常発生無
    }
    // メーカコード	(EPC: 0x8A) をセットする
    if (vals['8A']) {
      vals['8A'] = '000077'; // 学校法人幾徳学園　神奈川工科大学 (KAIT)
    }
    // 現在年月日設定 (EPC: 0x98) をセットする
    if (vals['98']) {
      if (this._conf['clock-sync'] === false) {
        vals['98'] = '00010101';
      }
    }

    // 0288 低圧スマート電力量メータ
    if (/^0288/.test(this._eoj)) {
      // 積算電力量計測値履歴1（正方向計測値）
      if ('E2' in vals) {
        vals['E2'] = this._createElectricEnergyHistoricalData();
      }
      // 積算電力量計測値履歴1（逆方向計測値）
      if ('E4' in vals) {
        vals['E4'] = this._createElectricEnergyHistoricalData();
      }
      // 積算電力量計測値履歴2（正方向、逆方向計測値）
      if ('EC' in vals) {
        vals['EC'] = this._createElectricEnergyLogData();
      }
    }

    // 0x028A 高圧スマート電力量メータの場合
    if (/^028A/.test(this._eoj)) {
      // 需要電力計測値履歴
      if ('C6' in vals) {
        vals['C6'] = this._createElectricEnergyHistoricalData();
      }
      // 力測積算無効電力量（遅れ）計測値履歴
      if ('CE' in vals) {
        vals['CE'] = this._createElectricEnergyHistoricalData();
      }
      // 積算有効電力量計測値履歴
      if ('E7' in vals) {
        vals['E7'] = this._createElectricEnergyHistoricalData();
      }
    }

    // 0x0287 分電盤メータリングの場合
    if (/^0287/.test(this._eoj)) {
      let epc_list_1 = [
        'B3', // 積算電力量計測値リスト（片方向）
        'B5', // 瞬時電流計測値リスト（片方向）
        'B7'  // 瞬時電力計測値リスト（片方向）
      ];
      for (let epc of epc_list_1) {
        if (epc in vals) {
          vals[epc] = '010100000000';
        }
      }

      let epc_list_2 = [
        'BA', // 積算電力量計測値リスト（双方向）
        'BC', // 瞬時電流計測値リスト（双方向）
        'BE'  // 瞬時電力計測値リスト（双方向）
      ];
      for (let epc of epc_list_2) {
        if (epc in vals) {
          vals[epc] = '01010000000000000000';
        }
      }
    }

    // 0x02A1 電気自動車充電器の場合
    if (/^02A1/.test(this._eoj)) {
      // 0xE6 車両ID
      if ('E6' in vals) {
        vals['E6'] = '00';
      }
    }

    // 0x027E 電気自動車充放電器の場合
    if (/^027E/.test(this._eoj)) {
      // 0xE6 車両ID
      if ('E6' in vals) {
        vals['E6'] = '00';
      }
    }

    // 0x0602 テレビ
    if (/^0602/.test(this._eoj)) {
      // 0xB2 表示可能文字コード
      if ('B2' in vals) {
        let v = 0b10000000;
        vals['B2'] = Buffer.from([v, 0x00]).toString('hex').toUpperCase();
      }
      // 0xB3 伝達文字列設定
      if ('B3' in vals) {
        vals['B3'] = '000800';
      }
    }
  }

  _createElectricEnergyLogData() {
    let buf = Buffer.alloc(6 + 1 + (8 * 12));
    // 積算履歴収集日時 (6 バイト)
    let dt = new Date();
    let Y = dt.getFullYear();
    let M = dt.getMonth() + 1;
    let D = dt.getDate();
    let h = dt.getHours();
    let m = dt.getMinutes();
    buf.writeUInt16BE(Y, 0);
    buf.writeUInt8(M, 2);
    buf.writeUInt8(D, 3);
    buf.writeUInt8(h, 4);
    buf.writeUInt8(m, 5);
    // 収集コマ数
    buf.writeUInt8(12, 6);
    // 積算電力量計測値(正方向)
    let nlist = [];
    for (let i = 112; i >= 101; i--) {
      nlist.push(i);
    }
    // 積算電力量計測値(逆方向)
    let rlist = [];
    for (let i = 12; i >= 1; i--) {
      rlist.push(i);
    }
    //
    for (let i = 0; i < 12; i++) {
      let ost = 7 + (8 * i);
      buf.writeUInt32BE(nlist[i], ost);
      buf.writeUInt32BE(rlist[i], ost + 4);
    }
    let hex = buf.toString('hex').toUpperCase();
    return hex;
  }

  _createElectricEnergyHistoricalData() {
    // 48 個のデータセットを 100 セット用意する
    let ary = [];
    let v = 0;
    for (let day = 0; day < 100; day++) {
      let buf = Buffer.alloc(2 + (4 * 48));
      buf.writeUInt16BE(day, 0);
      for (let i = 0; i < 48; i++) {
        let offset = 2 + (4 * i);
        buf.writeUInt32BE(v, offset);
        v++;
      }
      ary.push(buf.toString('hex').toUpperCase());
    }
    return ary;
  }

  // プロパティマップをセットする
  _setPropertyMaps() {
    let supported_epc_lists = {
      get: [],
      set: [],
      inf: []
    };
    let props = this._desc['elProperties'];
    Object.keys(this._states).forEach((epc) => {
      let prop = props[epc];
      if (!prop) {
        return;
      }
      let rule = prop['accessRule'];
      if (!rule) {
        return;
      }

      this._property_map[epc] = {
        get: false,
        set: false,
        inf: false
      };

      let settings = this._eoj_settings[epc] || {};
      let map = {};
      if (settings['propertyMap']) {
        map = settings['propertyMap'];
      }

      ['get', 'set', 'inf'].forEach((k) => {
        let supported = false;
        //if (rule[k] === 'required' || rule[k] === 'required_c') {
        if (rule[k].startsWith('required')) {
          supported = true;
        } else if (rule[k] === 'optional') {
          if (k in map) {
            supported = map[k];
          } else {
            if (k === 'inf') {
              // INF の場合は optional なら無効にする
              supported = false;
            } else {
              supported = true;
            }
          }
        }
        if (supported === true) {
          supported_epc_lists[k].push(epc);
          this._property_map[epc][k] = true;
        }
      });
    });

    this._setPropertyMap('9F', supported_epc_lists['get']); // Get プロパティマップ
    this._setPropertyMap('9E', supported_epc_lists['set']); // Set プロパティマップ
    this._setPropertyMap('9D', supported_epc_lists['inf']); // 状変アナウンスプロパティマップ
  }

  _setPropertyMap(pmap_epc, epc_list) {
    let n = epc_list.length;
    let v = '';
    if (n < 16) {
      let nlist = [];
      nlist.push(n);
      epc_list.forEach((epc) => {
        nlist.push(parseInt(epc, 16));
      });
      v = Buffer.from(nlist).toString('hex');
    } else {
      let byte_list = [];
      for (let i = 0; i < 16; i++) {
        byte_list.push(0);
      }
      epc_list.forEach((epc) => {
        let h1 = parseInt(epc.substr(0, 1), 16);
        let h2 = parseInt(epc.substr(1, 1), 16);
        if (h1 < 8) {
          return;
        }
        let byte = byte_list[h2];
        byte_list[h2] = byte | (1 << (h1 - 8));
      });
      byte_list.unshift(n);
      v = Buffer.from(byte_list).toString('hex');
    }
    this._states[pmap_epc] = v;
  }

  // 状態ファイルを読み取る (同期) : init() 用
  _readStateFileSync() {
    let o = null;
    if (mFs.existsSync(this._fpath)) {
      try {
        let json_text = mFs.readFileSync(this._fpath, { encoding: 'utf8' });
        o = JSON.parse(json_text);
      } catch (error) {
        throw error;
      }
      return o;
    } else {
      return null;
    }
  }

  // 状態ファイルを書きだす (同期) : init() 用
  _writeStateFileSync() {
    try {
      let json_text = JSON.stringify(this._states, null, '  ');
      mFs.writeFileSync(this._fpath, json_text, { encoding: 'utf-8' });
    } catch (error) {
      throw error;
    };
  }

  // 状態ファイルを書きだす (非同期かつ遅延アリ)
  _writeStateFileDelay(delay_msec, cvals) {
    let retry = 0;
    let saveFile = () => {
      if (this._flock === true) {
        retry++;
        if (retry <= 3) {
          setTimeout(() => {
            saveFile();
          }, 100);
        } else {
          console.error(new Error('Faild to save the file: ' + this._fpath + ' (File locked)'));
        }
        return;
      }
      this._flock = true;
      let json_text = JSON.stringify(this._states, null, '  ');
      mFs.writeFile(this._fpath, json_text, { encoding: 'utf-8' }, (error) => {
        this._flock = false;
        if (error) {
          console.error(error);
        } else {
          if (Object.keys(cvals).length > 0) {
            this.onchange(cvals);
          }
        }
      });
    };
    setTimeout(() => {
      saveFile();
    }, delay_msec);
  }


  // 状態ファイルを書きだす (非同期)
  _writeStateFile() {
    let promise = new Promise((resolve, reject) => {
      let retry = 0;
      let saveFile = () => {
        if (this._flock === true) {
          retry++;
          if (retry <= 3) {
            setTimeout(() => {
              saveFile();
            }, 100);
          } else {
            reject(new Error('Faild to save the file: ' + this._fpath + ' (File locked)'));
          }
          return;
        }
        this._flock = true;
        let json_text = JSON.stringify(this._states, null, '  ');
        mFs.writeFile(this._fpath, json_text, { encoding: 'utf-8' }, (error) => {
          this._flock = false;
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      };
      saveFile();
    });
    return promise;
  }

  // デバッグ用
  getAllEpcValues() {
    return JSON.parse(JSON.stringify(this._states));
  }


  /* ------------------------------------------------------------------
  * getAccessRule(epc)
  * EPC に対するアクセスルールを返す
  *
  * 引数:
  * - epc    | String | required | EPC (例: "80")
  *
  * 戻値:
  * {
  *   "get": true,
  *   "set": true,
  *   "inf": false
  * }
  * ---------------------------------------------------------------- */
  getAccessRule(epc) {
    let map = this._property_map[epc];
    if (map) {
      return JSON.parse(JSON.stringify(map))
    } else {
      return {
        get: false,
        set: false,
        inf: false
      };
    }
  }

  /* ------------------------------------------------------------------
  * getEpcValues(props, is_admin)
  * EPC の値を取得する
  *
  * 引数:
  * - props    | Array | required |
  *     - 例: [{"epc": "8A", "edt":"any"}, ...]
  *     - epc の値しか見ないので edt の any の部分は何が入っていても構わない
  * - is_admin | Boolean | optional |
  *     - true なら、Device Description のアクセスルールをチェックせずに
  *       強制的に実行する。主にダッシュボード向けに使うモード。
  *     - false なら Device Description のアクセスルールに基づいた動作を
  *       行う。主に EL パケット受信時の処理のために使うモード。
  *     - デフォルトは false。
  *
  * 戻値:
  * - Promise オブジェクト
  *   非同期処理ではないので本来は Promise を返す必要はないが、setEpcValues() に
  *   合わせるため、意図的に Promise を返している。
  *
  * resolve() には、結果を表すオブジェクトが渡される:
  * {
  *    result  : 読み出しに失敗した EDT の数 (つまりすべて成功すれば 0),
  *    message : エラーメッセージ、エラーがなければ null, 複数の失敗があれば最後のエラーメッセージがセット,
  *    vals    : 読み出しに成功した EDT にはその値 が、失敗した EDT には null がセット (SNA を想定)
  *  }
  *
  * reject() は本メソッドに渡されたパラメータに不備があった場合のみ呼び出される。
  * ---------------------------------------------------------------- */
  getEpcValues(props, is_admin) {
    let promise = new Promise((resolve, reject) => {
      if (!Array.isArray(props)) {
        reject(new Error('The `props` must be an array.'));
        return;
      }
      let epc_list = [];
      props.forEach((p) => {
        let epc = p['epc'];
        epc_list.push(epc);
      });
      if (epc_list.length === 0) {
        reject(new Error('The `props` is empty.'));
        return;
      }
      let err = null;
      let fail_num = 0;
      let vals = {};
      for (let i = 0; i < epc_list.length; i++) {
        let epc = epc_list[i];
        // アクセスルールのチェック
        if (!is_admin) {
          if (this._checkEpcPermission('get', epc)) {
            vals[epc] = this._states[epc];
          } else {
            err = 'The value of EDT is not allowed to get.';
            fail_num++;
            vals[epc] = null;
            continue;
          }
        } else {
          vals[epc] = this._states[epc];
        }

        // number 型の場合、EDT の値が max/min の範囲外なら overflow または underflow を返す
        if (!is_admin) {
          let desc_data = this._desc['elProperties'][epc]['data'];
          let edt_buf = this._convHexToBuffer(vals[epc]);
          let parsed = this._parser.parsePropertyValue(desc_data, edt_buf, epc, this._eoj);
          if (parsed && parsed['type'] === 'number') {
            let d = parsed['number'];
            let v = d['value'];
            if (d['multiple']) {
              v = v / d['multiple'];
            }
            let min = ('minimum' in d) ? d['minimum'] : null;
            let max = ('maximum' in d) ? d['maximum'] : null;
            let fmt = d['format'];
            if (min !== null && v < min) {
              // Under Flow
              if (fmt === 'int8') {
                vals[epc] = '80';
              } else if (fmt === 'int16') {
                vals[epc] = '8000';
              } else if (fmt === 'int32') {
                vals[epc] = '80000000';
              } else if (fmt === 'uint8') {
                vals[epc] = 'FE';
              } else if (fmt === 'uint16') {
                vals[epc] = 'FFFE';
              } else if (fmt === 'uint32') {
                vals[epc] = 'FFFFFFFE';
              }
            } else if (max !== null && v > max) {
              // Over Flow
              if (fmt === 'int8') {
                vals[epc] = '7F';
              } else if (fmt === 'int16') {
                vals[epc] = '7FFF';
              } else if (fmt === 'int32') {
                vals[epc] = '7FFFFFFF';
              } else if (fmt === 'uint8') {
                vals[epc] = 'FF';
              } else if (fmt === 'uint16') {
                vals[epc] = 'FFFF';
              } else if (fmt === 'uint32') {
                vals[epc] = 'FFFFFFFF';
              }
            }
          }
        }

        // 個別処理
        let special_edt = this._getSpecialEdt(epc);
        if (special_edt) {
          vals[epc] = special_edt;
        }
      }

      let res = {
        result: fail_num,
        message: err,
        vals: vals
      };

      resolve(res);
    });
    return promise;
  }

  _convHexToBuffer(hex) {
    if (!hex || typeof (hex) !== 'string' || !/^[a-fA-F0-9]+$/.test(hex) || hex.length % 2 !== 0) {
      return null;
    }
    let blen = hex.length / 2;
    let buf = Buffer.alloc(blen);
    for (let i = 0; i < blen; i++) {
      let h = hex.substr(i * 2, 2);
      let dec = parseInt(h, 16);
      buf.writeUInt8(dec, i);
    }
    return buf;
  }

  _getSpecialEdt(epc) {
    // スーパークラスの個別処理
    if (epc === '97') { // 現在時刻設定
      return this._getEdt97();
    } else if (epc === '98') { // 現在年月日設定
      return this._getEdt98();
    } else if (epc === '9A') { // 積算運転時間
      return this._getEdt9A();
    }

    if (/^0287/.test(this._eoj)) {
      // 分電盤メータリング: Power Distribution Board: 0x0287
      if (/^(B3|B5|B7|BA|BC|BE)$/.test(epc)) {
        /*
        // ------------------------------------
        // - 0xB3 積算電力量計測値リスト（片方向）
        // - 0xB5 瞬時電流計測値リスト（片方向）
        // - 0xB7 瞬時電力計測値リスト（片方向）
        // - 0xBA 積算電力量計測値リスト（双方向）
        // - 0xBC 瞬時電流計測値リスト（双方向）
        // - 0xBE 瞬時電力計測値リスト（双方向）
        // ------------------------------------
        let item_size = 2;
        let start_max = 252;
        let num_max = 60;
        if (epc === 'BA') {
          item_size = 4;
          num_max = 30;
        }
        let start = 1;
        let num = num_max;
  
        let epc2 = Buffer.from([parseInt(epc, 16) - 1]).toString('hex').toUpperCase();
        let edt2 = this._states[epc2];
        if (edt2 && edt2.length === 4) {
          start = parseInt(edt2.substr(0, 2), 16);
          num = parseInt(edt2.substr(2, 2), 16);
          if (start < 1) {
            start = 1;
          }
          if (start > start_max) {
            start = start_max;
          }
          if (num < 1) {
            num = 1;
          }
          if (num > num_max) {
            num = num_max;
          }
          if (start + num - 1 < start_max) {
            num = start_max - start + 1;
          }
        }
        let byte_list = [start, num];
        for (let i = 0; i < num; i++) {
          for (let j = 0; j < item_size; j++) {
            byte_list.push(0);
          }
        }
        return Buffer.from(byte_list).toString('hex').toUpperCase();
        */
      } else if (/^(C3|C4)$/.test(epc)) {
        // ------------------------------------
        // - 0xC3 積算電力量計測値履歴（正方向）
        // - 0xC4 積算電力量計測値履歴（逆方向）
        // ------------------------------------
        let day_num_hex = this._states['C5'];
        let day_num = 0x63; // 99
        if (day_num_hex && day_num_hex.length === 2) {
          day_num = parseInt(day_num_hex, 16);
          if (day_num > 0x63) {
            day_num = 0x63;
          }
        }
        let day_num_buf = Buffer.alloc(2);
        day_num_buf.writeUInt16BE(day_num, 0);
        let hex = day_num_buf.toString('hex');
        for (let i = 0; i < 48; i++) {
          hex += '00000000';
        }
        return hex.toUpperCase();
      }
    } else if (/^0288/.test(this._eoj)) {
      // 低圧スマート電力量メータ: Low Voltage Smart Electric Energy Meter: 0x0288
      if (/^(E2|E4)$/.test(epc)) {
        // ------------------------------------
        // - 0xE2 積算電力量計測値履歴1（正方向計測値）
        // - 0xE4 積算電力量計測値履歴1（逆方向計測値）
        // ------------------------------------
        let day_num_hex = this._states['E5'];
        let day_num = 0;
        if (day_num_hex && day_num_hex.length === 2) {
          day_num = parseInt(day_num_hex, 16);
          if (day_num > 0x63) {
            day_num = 0x63;
          }
        }
        return this._states[epc][day_num];
      }
    } else if (/^028A/.test(this._eoj)) {
      // 高圧スマート電力量メータ: High Voltage Smart Electric Energy Meter: 0x028A
      if (/^(C6|CE|E7)$/.test(epc)) {
        // ------------------------------------
        // - 0xC6 需要電力量計測値履歴
        // - 0xCE 力測積算無効電力量（遅れ）計測値履歴
        // - 0xE7 積算有効電力量計測値履歴
        // ------------------------------------
        let day_num_hex = this._states['E1'];
        let day_num = 0;
        if (day_num_hex && day_num_hex.length === 2) {
          day_num = parseInt(day_num_hex, 16);
          if (day_num > 0x63) {
            day_num = 0x63;
          }
        }
        return this._states[epc][day_num];
      }
    }
    return null;
  }

  // 現在時刻設定 (EPC: 0x97) を取得
  _getEdt97() {
    if (this._conf['clock-sync']) {
      let now = Date.now() + this._time_diff;
      let dt = new Date(now);
      let h = dt.getHours();
      let m = dt.getMinutes();
      return Buffer.from([h, m]).toString('hex').toUpperCase();
    } else {
      return null;
    }
  }

  // 現在年月日設定 (EPC: 0x98) を取得
  _getEdt98() {
    if (this._conf['clock-sync']) {
      let now = Date.now() + this._time_diff;
      let dt = new Date(now);
      let Y = dt.getFullYear();
      let M = dt.getMonth() + 1;
      let D = dt.getDate();
      let buf = Buffer.alloc(4);
      buf.writeUInt16BE(Y, 0);
      buf.writeUInt8(M, 2);
      buf.writeUInt8(D, 3);
      return buf.toString('hex').toUpperCase();
    } else {
      return null;
    }
  }

  // 積算運転時間 (EPC: 0x9A) を取得
  _getEdt9A() {
    let now = parseInt((Date.now() / 1000), 10);
    let t = now - this._init_time;
    let buf = Buffer.alloc(5);
    buf.writeUInt8(0x41, 0);
    buf.writeUInt32BE(t, 1);
    return buf.toString('hex').toUpperCase();
  }



  // EPC のアクセスルールをチェック
  _checkEpcPermission(req_type, epc) {
    // 存在する EPC かどうかをチェック
    let desc_props = this._desc['elProperties'];
    if (!desc_props[epc] || !desc_props[epc]['accessRule']) {
      return false;
    }

    // プロパティマップをチェック
    let map = this._property_map[epc];
    if (!map) {
      return false;
    }
    if (/^(get|set|inf)$/.test(req_type)) {
      return map[req_type];
    } else if (req_type === 'setget') {
      return (map['set'] && map['get']);
    } else {
      return false;
    }
  }

  /* ------------------------------------------------------------------
  * setEpcValues(props, is_admin, set_delay_msec)
  * EPC の値を保存する
  *
  * 引数:
  * - props    | Array   | required |
  *     - 例: [{"epc": "8A", "edt":"any"}, ...]
  * - is_admin | Boolean | optional |
  *     - true なら、Device Description のアクセスルールをチェックせずに
  *       強制的に実行する。主にダッシュボード向けに使うモード。
  *       さらに、number 型の上限・下限値といったチェックも行わない。
  *     - false なら Device Description のアクセスルールに基づいた動作を
  *       行う。EL パケット受信時の処理のために使うモード。
  *     - デフォルトは false。
  * - set_delay_msec | Number | optional |
  *     - 実際に EPC データを書き込む際の遅延時間 (ミリ秒)。
  *     - is_admin が false の場合のみ有効。
  *     - 実際に EPC データを書き込む前に resolve() を呼び出す。
  *     - EL パケット受信時の処理のために使うオプション。
  *
  * 戻値:
  * - Promise オブジェクト
  *
  * resolve() には、結果を表すオブジェクトが渡される:
  * {
  *    result  : 保存に失敗した EDT の数 (つまりすべて成功すれば 0),
  *    message : エラーメッセージ、エラーがなければ null, 複数の失敗があれば最後のエラーメッセージがセット,
  *    vals    : 保存に成功した EDT は null が、失敗した EDT は引数の vals と同じ (SNA を想定),
  *    changed : 変更があった ECP と EDT のハッシュオブジェクト (状態変化INFの情報源として使われる)
  *  }
  *
  * reject() は本メソッドに渡されたパラメータに不備があった場合のみ呼び出される。
  * ---------------------------------------------------------------- */
  setEpcValues(props, is_admin, set_delay_msec) {
    if (is_admin || !set_delay_msec) {
      set_delay_msec = 0;
    }
    let promise = new Promise((resolve, reject) => {
      if (!Array.isArray(props)) {
        reject(new Error('The `props` must be an array.'));
        return;
      }
      let epc_list = [];
      let vals = {};
      props.forEach((p) => {
        let epc = p['epc'];
        let edt = p['edt'];
        epc_list.push(epc);
        vals[epc] = edt;
      });
      if (epc_list.length === 0) {
        reject(new Error('The `props` is empty.'));
        return;
      }
      let err = null;
      let fail_num = 0;
      let uvals = {};
      for (let i = 0; i < epc_list.length; i++) {
        let epc = epc_list[i];
        let v = vals[epc];
        // アクセスルールのチェック
        if (!is_admin) {
          if (!this._checkEpcPermission('set', epc)) {
            err = 'The value of EDT is not allowed to set: ' + epc;
            fail_num++;
            continue;
          }
        }
        // EDT のチェック
        let prop = this._desc['elProperties'][epc];
        if (!prop || !prop['data']) {
          err = 'The specified EPC was not found in the Device Description: epc=0x' + epc;
          fail_num++;
          continue;
        }
        let pdata = prop['data'];
        if (!this._isValidEdt(v, pdata, is_admin)) {
          err = 'The value of EDT is invalid: epc=0x' + epc + ', edt=0x' + v;
          fail_num++;
          continue;
        }

        uvals[epc] = v;
        if (epc === '97') { // 現在時刻設定
          this._setEdt97(v);
        } else if (epc === '98') { // 現在年月日設定
          this._setEdt98(v);
        }
      }
      let cvals = {};
      Object.keys(uvals).forEach((epc) => {
        let v = uvals[epc];
        if (this._states[epc] !== v) {
          cvals[epc] = v;
        }
      });

      // 個別処理: リセット系 EPC
      this._setEpcForReset(uvals, cvals);

      // 個別処理: 計測履歴系 EPC
      let energy_historical_vals = this._setElectricEnergyHistoricalData(uvals, cvals);

      // 戻り値生成
      let rvals = {};
      Object.keys(vals).forEach((epc) => {
        if (uvals[epc]) {
          rvals[epc] = null;
        } else {
          rvals[epc] = vals[epc];
        }
      });
      let res = {
        result: fail_num,
        message: err,
        vals: rvals,
        changed: cvals
      };
      // ファイルへ書き込み
      let svals = JSON.parse(JSON.stringify(cvals));
      for (let epc_hex in energy_historical_vals) {
        svals[epc_hex] = energy_historical_vals[epc_hex];
      }
      for (let epc in svals) {
        this._states[epc] = svals[epc];
      }
      if (set_delay_msec > 0) {
        this._writeStateFileDelay(set_delay_msec, svals);
        resolve(res);
      } else {
        this._writeStateFile().then(() => {
          if (Object.keys(svals).length > 0) {
            this.onchange(svals);
          }
          resolve(res);
        }).catch((error) => {
          reject(error);
        });
      }
    });
    return promise;
  }

  _setElectricEnergyHistoricalData(uvals, cvals) {
    let save_vals = {};
    let updateHistory = (epc_hex) => {
      let hist = this._states[epc_hex];
      let v = uvals[epc_hex];
      let day = parseInt(v.substr(0, 2), 16);
      if (day > 99) {
        return;
      }
      if (v === hist[day]) {
        delete cvals[epc_hex];
      } else {
        cvals[epc_hex] = v;
        hist[day] = v;
        save_vals[epc_hex] = hist;
      }
    };
    // 低圧スマート電力量メータ
    if (/^0288/.test(this._eoj)) {
      // 積算電力量計測値履歴1（正方向計測値）
      if ('E2' in uvals) {
        updateHistory('E2');
      }
      // 積算電力量計測値履歴1（逆方向計測値）
      if ('E4' in uvals) {
        updateHistory('E4');
      }
    }
    // 高圧スマート電力量メータの場合
    if (/^028A/.test(this._eoj)) {
      // 需要電力計測値履歴
      if ('C6' in uvals) {
        updateHistory('C6');
      }
      // 力測積算無効電力量（遅れ）計測値履歴
      if ('CE' in uvals) {
        updateHistory('CE');
      }
      // 積算有効電力量計測値履歴
      if ('E7' in uvals) {
        updateHistory('E7');
      }
    }
    return save_vals;
  }

  _setEpcForReset(uvals, cvals) {
    if (/^0279/.test(this._eoj)) {
      // 住宅用太陽光発電: PV Power Generation: 0x0279
      if (uvals['E2']) {
        // EPC: 0xE2 積算発電電力量リセット設定
        // 0xE1 (積算発電電力量計測値) の値を 0 にする
        let v = '00000000';
        if (this._states['E1'] !== v) {
          this._states['E1'] = v;
          cvals['E1'] = v;
        }
      }
      if (uvals['E4']) {
        // EPC: 0xE4 積算売電電力量リセット設定
        // 0xE3 (積算売電電力量計測値) の値を 0 にする
        let v = '00000000';
        if (this._states['E3'] !== v) {
          this._states['E3'] = v;
          cvals['E3'] = v;
        }
      }
    } else if (/^0279/.test(this._eoj)) {
      // 燃料電池: Fuel Cell: 0x027C
      if (uvals['C6']) {
        // EPC: 0xC6 積算発電電力量リセット設定
        // 0xC5 (積算発電電力量計測値) の値を 0 にする
        let v = '00000000';
        if (this._states['C5'] !== v) {
          this._states['C5'] = v;
          cvals['C5'] = v;
        }
      }
      if (uvals['C9']) {
        // EPC: 0xC9 積算ガス消費量リセット設定
        // 0xC8 (積算ガス消費量計測値) の値を 0 にする
        let v = '00000000';
        if (this._states['C8'] !== v) {
          this._states['C8'] = v;
          cvals['C8'] = v;
        }
      }
      if (uvals['CE']) {
        // EPC: 0xCE 宅内積算消費電力量リセット設定
        // 0xCD (宅内積算消費電力量計測値) の値を 0 にする
        let v = '00000000';
        if (this._states['CD'] !== v) {
          this._states['CD'] = v;
          cvals['CD'] = v;
        }
      }
    } else if (/^027D/.test(this._eoj)) {
      // 蓄電池: Storage Battery: 0x027D
      if (uvals['D7']) {
        // EPC: 0xD7 積算放電電力量リセット設定	
        // 0xD6 (積算放電電力量計測値) の値を 0 にする
        let v = '00000000';
        if (this._states['D6'] !== v) {
          this._states['D6'] = v;
          cvals['D6'] = v;
        }
      }
      if (uvals['D9']) {
        // EPC: 0xD9 積算充電電力量リセット設定	
        // 0xD8 (積算充電電力量計測値) の値を 0 にする
        let v = '00000000';
        if (this._states['D8'] !== v) {
          this._states['D8'] = v;
          cvals['D8'] = v;
        }
      }
    } else if (/^027E/.test(this._eoj)) {
      // 電気自動車充放電器: EV Charger and Discharger: 0x027E
      if (uvals['D7']) {
        // EPC: 0xD7 積算放電電力量リセット設定	
        // 0xD6 (積算放電電力量計測値) の値を 0 にする
        let v = '00000000';
        if (this._states['D6'] !== v) {
          this._states['D6'] = v;
          cvals['D6'] = v;
        }
      }
      if (uvals['D9']) {
        // EPC: 0xD9 積算充電電力量リセット設定	
        // 0xD8 (積算充電電力量計測値) の値を 0 にする
        let v = '00000000';
        if (this._states['D8'] !== v) {
          this._states['D8'] = v;
          cvals['D8'] = v;
        }
      }
    } else if (/^02A1/.test(this._eoj)) {
      // 電気自動車充電器: EV Charger: 0x02A1
      if (uvals['D9']) {
        // EPC: 0xD9 積算充電電力量リセット設定	
        // 0xD8 (積算充電電力量計測値) の値を 0 にする
        let v = '00000000';
        if (this._states['D8'] !== v) {
          this._states['D8'] = v;
          cvals['D8'] = v;
        }
      }
    }

  }

  // 現在時刻設定 (EPC: 0x97) をセット
  _setEdt97(hex) {
    if (!hex || hex.length !== 4) {
      return null;
    }
    let now = Date.now() + this._time_diff;
    let dt = new Date(now);
    let h = dt.getHours();
    let m = dt.getMinutes();
    let s = dt.getSeconds();

    let nh = parseInt(hex.substr(0, 2), 16);
    let nm = parseInt(hex.substr(2, 2), 16);

    let diff = (nh * 3600 + nm * 60) - (h * 3600 + m * 60) - s;
    this._time_diff += (diff * 1000);
  }

  // 現在年月日設定 (EPC: 0x98) をセット
  _setEdt98(hex) {
    if (!hex || hex.length !== 8) {
      return null;
    }
    let now = Date.now() + this._time_diff;
    let dt = new Date(now);
    let h = dt.getHours();
    let m = dt.getMinutes();
    let s = dt.getSeconds();

    let nY = parseInt(hex.substr(0, 4), 16);
    let nM = parseInt(hex.substr(4, 2), 16);
    let nD = parseInt(hex.substr(6, 2), 16);

    let YMD = [nY, ('0' + nM).slice(-2), ('0' + nD).slice(-2)].join('-')
    let hms = [('0' + h).slice(-2), ('0' + m).slice(-2), ('0' + s).slice(-2)].join(':');
    let new_dt = new Date(YMD + 'T' + hms);

    let diff = new_dt.getTime() - now;
    this._time_diff += diff;
  }

  _isValidEdt(val, pdata, is_admin) {
    if (!/^[0-9a-fA-F]*$/.test(val) || val.length % 2 !== 0) {
      return false;
    }

    if (pdata['oneOf']) {
      if (Array.isArray(pdata['oneOf']) && pdata['oneOf'].length > 0) {
        let is_valid = false;
        pdata['oneOf'].forEach((d) => {
          if (this._isValidEdt(val, d, is_admin)) {
            is_valid = true;
          }
        });
        return is_valid;
      } else {
        return false;
      }
    }

    let type = pdata['type'];
    if (!type || typeof (type) !== 'string') {
      return false;
    }

    if (type === 'number') {
      let format = pdata['format'];
      let hlen = 0;
      if (format === 'int8' || format === 'uint8') {
        hlen = 2;
      } else if (format === 'int16' || format === 'uint16') {
        hlen = 4;
      } else if (format === 'int32' || format === 'uint32') {
        hlen = 8;
      } else {
        return false;
      }
      if (val.length !== hlen) {
        return false;
      }

      let n = parseInt(val, 16);
      if (format === 'int8') {
        let buf = Buffer.alloc(1);
        buf.writeUInt8(n, 0);
        n = buf.readInt8(0);
      } else if (format === 'int16') {
        let buf = Buffer.alloc(2);
        buf.writeUInt16BE(n, 0);
        n = buf.readInt16BE(0);
      } else if (format === 'int32') {
        let buf = Buffer.alloc(4);
        buf.writeUInt32BE(n, 0);
        n = buf.readInt32BE(0);
      }

      if (is_admin) {
        return true;
      } else {
        if (pdata['enum']) {
          if (Array.isArray(pdata['enum']) && pdata['enum'].length > 0) {
            if (pdata['enum'].indexOf(n) >= 0) {
              return true;
            } else {
              return false;
            }
          } else {
            return false;
          }
        } else {
          if ('minimum' in pdata) {
            let min = pdata['minimum'];
            if (typeof (min) === 'number') {
              if (n < min) {
                return false;
              }
            } else {
              return false;
            }
          }

          if ('maximum' in pdata) {
            let max = pdata['maximum'];
            if (typeof (max) === 'number') {
              if (n > max) {
                return false;
              }
            } else {
              return false;
            }
          }

          return true;
        }
      }

    } else if (type === 'state' || type === 'numericValue') {
      let values = pdata['enum'];
      if (!values || !Array.isArray(values)) {
        return false;
      }
      let valid = false;
      for (let i = 0, len = values.length; i < len; i++) {
        let edt = values[i]['edt'];
        edt = edt.replace(/^0x/, '');
        if (edt === val) {
          valid = true;
          break;
        }
      }
      return valid;

    } else if (type === 'level') {
      let base = pdata['base'];
      if (!base || typeof (base) !== 'string') {
        return false;
      }

      let n = parseInt(val, 16);
      if (n + base > 255) {
        return false;
      }

      let max = pdata['maximum'];
      if (typeof (max) !== 'number') {
        return false;
      }
      base = base.replace(/^0x/, '');
      base = parseInt(base, 16);
      if (n >= base && n <= base + max - 1) {
        return true;
      } else {
        return false;
      }


    } else if (type === 'bitmap') {
      let size = pdata['size'];
      if (!size || typeof (size) !== 'number') {
        return false;
      }
      return (val.length / 2 === size) ? true : false;

    } else if (type === 'date-time') {
      let size = pdata['size'];
      if (!size || typeof (size) !== 'number') {
        size = 7;
      }
      let vlen = val.length / 2;
      if (vlen !== size || vlen < 2 || vlen > 7) {
        return false;
      }
      if (vlen >= 2) {
        let Y = parseInt(val.substr(0, 4), 16);
        if (Y < 1 || Y > 9999) {
          return false;
        }
      }
      if (vlen >= 3) {
        let M = parseInt(val.substr(4, 2), 16);
        if (M < 1 || M > 12) {
          return false;
        }
      }
      if (vlen >= 4) {
        let D = parseInt(val.substr(6, 2), 16);
        if (D < 1 || D > 31) {
          return false;
        }
      }
      if (vlen >= 5) {
        let h = parseInt(val.substr(8, 2), 16);
        if (h < 0 || h > 23) {
          return false;
        }
      }
      if (vlen >= 6) {
        let m = parseInt(val.substr(10, 2), 16);
        if (m < 0 || m > 59) {
          return false;
        }
      }
      if (vlen >= 7) {
        let s = parseInt(val.substr(12, 2), 16);
        if (s < 0 || s > 59) {
          return false;
        }
      }
      return true;
    } else if (type === 'time') {
      let size = pdata['size'];
      if (!size || typeof (size) !== 'number') {
        size = 3;
      }
      let vlen = val.length / 2;
      if (vlen !== size || vlen < 1 || vlen > 3) {
        return false;
      }
      if (vlen >= 1) {
        let h = parseInt(val.substr(0, 2), 16);
        if (h < 0 || h > 23) {
          return false;
        }
      }
      if (vlen >= 2) {
        let m = parseInt(val.substr(2, 2), 16);
        if (m < 0 || m > 59) {
          return false;
        }
      }
      if (vlen >= 3) {
        let s = parseInt(val.substr(4, 2), 16);
        if (s < 0 || s > 59) {
          return false;
        }
      }
      return true;

    } else if (type === 'raw') {
      if ('minSize' in pdata) {
        let min = pdata['minSize'];
        if (typeof (min) === 'number') {
          if (val.length / 2 < min) {
            return false;
          }
        } else {
          return false;
        }
      }
      if ('maxSize' in pdata) {
        let max = pdata['maxSize'];
        if (typeof (max) === 'number') {
          if (val.length / 2 > max) {
            return false;
          }
        } else {
          return false;
        }
      }
      return true;

    } else if (type === 'object') {
      return true;
    } else if (type === 'array') {
      return true;
    } else {
      return false;
    }
  }
}

module.exports = DeviceState;
