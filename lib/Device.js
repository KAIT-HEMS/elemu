/* ------------------------------------------------------------------
* Device.js
* エミュレートする EL デバイスを表すモジュール
*
* - EL パケットの送受信はこのモジュールがハンドリングする
* - 必要に応じてコントローラーとなる index.js にイベントハンドラを通して伝達する
* ---------------------------------------------------------------- */
'use strict';
const mPacketComposer = require('./PacketComposer.js');
const mPacketParser = require('./PacketParser.js');
const mDeviceObject = require('./DeviceObject.js');
const mInitValues = require('./InitValues.js');
const mPacketLogger = require('./PacketLogger.js');
const mPacketSender = require('./PacketSender.js');
const mIpAddressUtils = require('./IpAddressUtils.js');
const mEojSettings = require('./EojSettings.js');

const mDgram = require('dgram');
const mFs = require('fs');
const mPath = require('path');

class Device {
  /* ------------------------------------------------------------------
  * Constructor
  * ---------------------------------------------------------------- */
  constructor(conf, mDeviceDescription, mManufacturerTable, console_obj) {
    // 設定情報
    this._conf = JSON.parse(JSON.stringify(conf));

    // DeviceDescription
    this._mDeviceDescription = mDeviceDescription;

    // ManufacturerTable
    this._mManufacturerTable = mManufacturerTable;

    // Console
    this._console = console_obj;

    // デバイスオブジェクトのオブジェクトを格納したハッシュ
    this._device_objects = {};

    // 本インスタンスの init() が呼び出されたかどうかのフラグ
    this._initialized = false;

    // Dgram モジュールから生成する UDP オブジェクト
    this._udp = null;

    // IPアドレスユーティリティ
    this._ip_address_utils = null;

    // DeviceDescription パーサーオブジェクト
    this._parser = new mPacketParser(this._mDeviceDescription, this._mManufacturerTable);

    // EL パケット送受信ログオブジェクト
    this._packet_logger = null;

    // EOJ 情報をロード
    this._current_eoj_list_json = mPath.resolve(__dirname, '../data/current_eoj_list.json');
    this._current_eoj_list = [];

    // イベントハンドラ
    this.onreceived = () => { }; // EL パケット受信イベント
    this.onsent = () => { }; // EL パケット送信イベント
    this.onepcupdated = () => { }; // EPC 更新イベント
    this.onpowerstatuschanged = () => { }; // 電源状態変化イベント
    this.ondiscovered = () => { }; // リモートデバイス発見イベント
    this.ondisappeared = () => { }; // リモートデバイスロストイベント
    this.onremoteepcupdated = () => { }; // リモートデバイス EPC 更新イベント

    // EL パケット送信モジュールのインスタンス
    this._packet_sender = null;

    // ノードプロファイルが送信専用ノードの場合にインスタンスリスト通知アナウンス
    // を送信するためのタイマーオブジェクト
    this.instance_announce_timer = null;
    this.property_announce_timer = null;

    // 送信専用ノードの場合に、プロパティ通知送信中かどうかのフラグ
    this.is_sending_property_notification = false;

    // -----------------------------------------------------
    // 以下、コントローラーの場合のパラメータ
    // -----------------------------------------------------

    // コントローラーかどうかのフラグ
    this._is_controller = false;
    this._controller_eoj = '';

    // 発見したリモートの EL デバイス
    //  {
    //    "192.168.11.4": { // IP アドレス
    //      "01013501": {   // EOJ
    //        "get": [],    // Get をサポートした EPC のリスト (Get プロパティマップ)
    //        "set": [],    // Set をサポートした EPC のリスト (Set プロパティマップ)
    //        "inf": []     // Inf をサポートした EPC のリスト (状変アナウンスプロパティマップ)
    //      },
    //      ...
    //    },
    //    ...
    //  }
    this._remote_devices = {};

    // レスポンス受信を必要とするリクエストのコールバック
    //  キーは TID
    this._request_callback_map = {};
    this._request_release_map = {};

    // リモートデバイスへのリクエストのタイムアウト (ミリ秒)
    this._requiest_timeout_msec = 5000;
    // リモートデバイスへ連続してリクエストする場合の間隔 (ミリ秒)
    this._request_interval_msec = 1000;

    // リモートデバイスへのリクエストの最大リトライ回数
    // - もし 2 を指定したら、最大で 3 回リクエストを送ることになる。
    this._request_retry_limit = 2;
  }

  // 設定情報が更新されたときの処理
  updateConf(conf) {
    // 変更があったパラメータ名のリスト
    let changed_param_list = [];
    Object.keys(this._conf).forEach((k) => {
      if (this._conf[k] !== conf[k]) {
        changed_param_list.push(k);
      }
    });

    // 初期化が必要かどうかを検証
    let init_required_flag = false;
    if (changed_param_list.indexOf('ip_address_version') >= 0) {
      init_required_flag = true;
    }
    if (changed_param_list.indexOf('instance_announce_interval_sec') >= 0) {
      init_required_flag = true;
    }
    if (changed_param_list.indexOf('property_announce_interval_sec') >= 0) {
      init_required_flag = true;
    }

    // 設定情報を更新
    this._conf = JSON.parse(JSON.stringify(conf));

    // 初期化
    if (init_required_flag) {
      let status = this.getPowerStatus();
      this.stop().then(() => {
        return this.init();
      }).then(() => {
        if (status === true) {
          return this.start();
        }
      }).then(() => {
        // Do nothing
      }).catch((error) => {
        console.error(error);
      });
    } else {
      // 初期化の必要がないなら、依存しているモジュールに伝達
      Object.keys(this._device_objects).forEach((eoj) => {
        let devobj = this._device_objects[eoj];
        devobj.updateConf(this._conf);
      });
    }
  }

  /* ------------------------------------------------------------------
  * 初期化
  * init([eoj_list])
  * - instances | array  | optional | EOJ情報を格納したオブジェクトのリスト
  *   - eoj     | string | required | EOJを表す 16進数文字列 (例: "013001")
  *   - epc     | array  | optional | サポートするEPCのリスト。null ならすべてをサポート。
  *             |        |          | (例: ["80", "B0", "B1", "B3", ...])
  *
  * 例:
  *  init([
  *    {eoj: "013001", epc: ["80", "B0", "B1", "B3", ...]},
  *    {eoj: "013002", epc: ["80", "B0", "B1", "B3", ...]}
  *  ]);
  *
  *  - EOJ "0EF001" (Node profile class) は自動的に登録される。
  *  - eoj_list が指定されなかった場合は、/data/current_eoj_list.json が
  *    適用される。
  * ---------------------------------------------------------------- */
  init(eoj_list) {
    return new Promise((resolve, reject) => {
      this._console.printSysInitMsg('Initializing a device...');

      this._request_callback_map = {};

      // EL パケット送受信ログオブジェクト
      if (this._conf['packet_log'] === true) {
        this._packet_logger = new mPacketLogger(this._conf);
      }

      // IpAddressUtils
      this._ip_address_utils = new mIpAddressUtils(this._conf['ip_address_version']);

      // EOJ リスト
      let new_eoj_list = [];
      if (eoj_list && eoj_list.length > 0) {
        // EOJ リストのチェック
        let chk = this._checkEojList(eoj_list);
        if (chk['result'] !== 0) {
          this._console.printSysInitRes('NG');
          reject(new Error(chk['message']));
          return;
        }
        new_eoj_list = chk['eojList'];
      } else {
        // EOJ リストの読み取り
        if (mFs.existsSync(this._current_eoj_list_json)) {
          try {
            let text = mFs.readFileSync(this._current_eoj_list_json, 'utf8');
            let list = JSON.parse(text);
            if (list && Array.isArray(list) && list.length > 0) {
              new_eoj_list = list;
            }
          } catch (error) {
            this._console.printSysInitRes('NG');
            reject(error);
            return;
          }
        }
      }

      // EOJ リストに Node profile class のオブジェクトが存在するかをチェック (0EF0XX)
      //  ついでにコントローラー (05FFXX) かどうかもチェック
      let node_profile_eoj = '';
      this._is_controller = false;
      for (let i = 0; i < new_eoj_list.length; i++) {
        let eoj = new_eoj_list[i]['eoj'];
        if (/^0EF0/.test(eoj)) {
          node_profile_eoj = eoj;
        }
        if (/^05FF/.test(eoj)) {
          this._is_controller = true;
          this._controller_eoj = eoj;
        }
      }

      // EOJ リスト情報に EOJ が 1 つもなければ家庭用エアコンを追加
      if (new_eoj_list.length === 0) {
        let desc = this._mDeviceDescription.getEoj('0130');
        new_eoj_list.push({
          eoj: '013001',
          epc: Object.keys(desc['elProperties']),
          release: this._mDeviceDescription.getRelease()
        });
      }

      // コントローラーなら他の EOJ は削除 (Node profile は削除しない)
      if (this._is_controller) {
        let new_eoj_list2 = [];
        for (let i = 0; i < new_eoj_list.length; i++) {
          let eoj = new_eoj_list[i]['eoj'];
          if (/^(05FF|0EF0)/.test(eoj)) {
            new_eoj_list2.push(new_eoj_list[i]);
          }
        }
        new_eoj_list = new_eoj_list2;
      }

      // EOJ リスト情報に Node profile がなければ追加 (0EF001)
      if (!node_profile_eoj) {
        node_profile_eoj = '0EF001';
        let desc = this._mDeviceDescription.getEoj(node_profile_eoj);
        new_eoj_list.unshift({
          eoj: node_profile_eoj,
          epc: Object.keys(desc['elProperties']),
          release: this._mDeviceDescription.getRelease()
        });
      }

      // EOJ 0x0EF0 (ノードプロファイル) の EPC 0xBF (個体識別番号) を除外
      new_eoj_list.forEach((eoj_desc) => {
        let eoj = eoj_desc['eoj'];
        if (/^0EF0/.test(eoj)) {
          let new_epc_list = [];
          eoj_desc['epc'].forEach((epc) => {
            if (epc !== 'BF') {
              new_epc_list.push(epc);
            }
          });
          eoj_desc['epc'] = new_epc_list;
        }
      });

      // EOJ リスト情報をファイルに書き込む
      let eoj_list_txt = JSON.stringify(new_eoj_list, null, '  ');
      try {
        mFs.writeFileSync(this._current_eoj_list_json, eoj_list_txt, 'utf-8');
      } catch (error) {
        reject(error);
        return;
      }
      this._current_eoj_list = new_eoj_list;

      // EOJ ごとにインスタンスを生成
      this._device_objects = {};
      new_eoj_list.forEach((ins) => {
        let eoj = ins['eoj'];
        let release = ins['release'];
        // EPC の初期値
        let user_init_values = mInitValues.get(eoj);
        let desc = this._mDeviceDescription.getEoj(eoj, ins['epc'], release);
        let devobj = new mDeviceObject(
          eoj,
          desc,
          user_init_values,
          this._conf,
          this._ip_address_utils,
          release,
          this._parser,
          mEojSettings.get(eoj)
        );
        devobj.init();
        this._device_objects[eoj] = devobj;
      });

      // デバイスオブジェクトのインスタンスに各種イベントハンドラをセット
      Object.keys(this._device_objects).forEach((eoj) => {
        let devobj = this._device_objects[eoj];
        // パケット送信のイベントハンドラをセット
        devobj.onsend = (address, packet) => {
          let buf = mPacketComposer.compose(packet);
          if (buf) {
            this.send(address, buf).then(() => {
              // Do nothing
              /*
              console.log('=============================================');
              console.log('To: ' + address);
              console.log('---------------------------------------------');
              console.log(JSON.stringify(packet, null, '  '));
              console.log('');
              */
            }).catch((error) => {
              // Do nothing
            });
          }
        };
        // EPC 更新イベントハンドラをセット
        devobj.onepcupdated = (eoj, props) => {
          this.onepcupdated({
            eoj: eoj,
            properties: props
          });
        };
      });

      // パケットログオブジェクトの初期化
      if (this._packet_logger) {
        this._packet_logger.init();
      }

      // Node profile class の EPC 初期値をセット
      this._initNodeProfileInstance(this._device_objects[node_profile_eoj]).then((res) => {
        this._initialized = true;
        this._console.printSysInitRes('OK');

        let eoj_list = this.getCurrentEojList();
        eoj_list.forEach((eoj_info) => {
          let eoj_code = eoj_info['eoj'];
          let o = this._mDeviceDescription.getEoj(eoj_code);
          let eoj_name = o['className'][this._conf['lang']];
          this._console.printSysInfo('  - ' + eoj_info['eoj'] + ' (' + eoj_name + ')');
        });

        resolve();
      }).catch((error) => {
        this._console.printSysInitRes('NG');
        reject(error);
      });
    });
  }

  _initNodeProfileInstance(devobj) {
    // サポートする EOJ のリストとノードクラスのリスト
    let eoj_list = [];
    let class_hash = {};
    Object.keys(this._device_objects).forEach((eoj) => {
      eoj_list.push(eoj);
      let class_code = eoj.substr(0, 4);
      class_hash[class_code] = true;
    });
    let eoj_num = eoj_list.length;
    let class_list = Object.keys(class_hash);
    let class_num = class_list.length;
    let props = [];

    // EPC 0xD3 自ノードインスタンス数 (3バイト) (ノードプロファイルを除く)
    let d3 = Buffer.alloc(4);
    d3.writeUInt32BE(eoj_num - 1, 0);
    props.push({
      epc: 'D3',
      edt: d3.slice(1, 4).toString('hex').toUpperCase()
    });

    // EPC 0xD4 自ノードクラス数 (2バイト) (ノードプロファイルを含む)
    let d4 = Buffer.alloc(2);
    d4.writeUInt16BE(class_num);
    props.push({
      epc: 'D4',
      edt: d4.toString('hex').toUpperCase()
    });

    // EPC 0xD5 インスタンスリスト通知 (ノードプロファイルを除く)
    // EPC 0xD6 自ノードインスタンスリストS (ノードプロファイルを除く)
    let d6 = [];
    let d6_eoj_num = eoj_num - 1;
    if (d6_eoj_num > 255) {
      d6_eoj_num = 255;
    }
    let d6_eoj_list_full = JSON.parse(JSON.stringify(eoj_list));
    let d6_eoj_list = [];
    d6_eoj_list_full.forEach((eoj) => {
      if (!/^0EF0/.test(eoj)) {
        d6_eoj_list.push(eoj);
      }
    });

    if (eoj_num > 84) {
      d6_eoj_list = d6.eoj_list.slice(0, 85);
    }
    d6.push(Buffer.from([d6_eoj_num]).toString('hex'));
    d6_eoj_list.forEach((e) => {
      d6.push(e);
    });

    props.push({
      epc: 'D5',
      edt: d6.join('').toUpperCase()
    });
    props.push({
      epc: 'D6',
      edt: d6.join('').toUpperCase()
    });

    // EPC 0xD7 自ノードクラスリストS (ノードプロファイルを除く)
    let d7 = [];
    let d7_class_num = class_num - 1;
    if (d7_class_num > 255) {
      d7_class_num = 255;
    }
    let d7_class_list_full = JSON.parse(JSON.stringify(class_list));
    let d7_class_list = [];
    d7_class_list_full.forEach((c) => {
      if (!/^0EF0/.test(c)) {
        d7_class_list.push(c);
      }
    });

    if (d7_class_num > 8) {
      d7_class_list = d7_class_list.slice(0, 9);
    }
    d7.push(Buffer.from([d7_class_num]).toString('hex'));
    d7_class_list.forEach((c) => {
      d7.push(c);
    });
    props.push({
      epc: 'D7',
      edt: d7.join('').toUpperCase()
    });
    return devobj.setEpcValues(props, true);
  }

  // EOJ リストの妥当性チェック
  _checkEojList(eoj_list) {
    if (!eoj_list || !Array.isArray(eoj_list) || eoj_list.length === 0) {
      return {
        result: 1,
        message: 'The parameter `eojList` must be a non-empty array.'
      };
    }

    // リリースバージョンの範囲を取得
    let release_list = this._mDeviceDescription.getReleaseList();
    // 最新のリリースバージョンを特定
    let latest_release = release_list[release_list.length - 1];

    let new_eoj_list = [];

    let err = '';
    for (let i = 0; i < eoj_list.length; i++) {
      let ins = eoj_list[i];
      if (typeof (ins) !== 'object') {
        err = 'Each element in the `eojList` must be an object.';
        break;
      }

      // リリースバージョンのチェック
      let release = latest_release;
      if ('release' in ins) {
        release = ins['release'];
      }
      if (release_list.indexOf(release) < 0) {
        err = 'The `release` must be between `A` and `' + latest_release + '`.';
      }

      // EOJ のチェック
      if (!('eoj' in ins)) {
        err = 'The `eoj` is required.';
        break;
      }
      let eoj = ins['eoj'];
      if (typeof (eoj) !== 'string' || !/^[0-9A-Fa-f]{6}$/.test(eoj)) {
        err = 'The `eoj` is invalid as an EOJ: ' + eoj;
        break;
      }
      eoj = eoj.toUpperCase();
      let desc = this._mDeviceDescription.getEoj(eoj, ins['epc']);
      if (!desc) {
        err = 'The `eoj` is unknown: ' + eoj;
        break;
      }

      if (release < desc['firstRelease']) {
        err = 'The EOJ `' + eoj + '` was available from the release `' + desc['firstRelease'] + '`.';
        break;
      }

      // EPC リスト
      let o = this._mDeviceDescription.getEoj(eoj, null, release);
      // パラメータ `epc` が指定されていなければ、すべての EPC を適用
      let epc_list = Object.keys(o['elProperties']);
      // パラメータ `epc` が指定されていれば、EPC をフィルター
      /*
      if ('epc' in ins) {
        let list = ins['epc'];
        if (!Array.isArray(list)) {
          err = 'The `epc` must be a non-empty array.';
          break;
        }
        let filtered_list = [];
        list.forEach((epc_hex) => {
          if (typeof (epc_hex) !== 'string' || !/^[0-9A-Fa-f]{2}$/.test(epc_hex)) {
            err = 'Each element in the `epc` must be `FF` format.';
          } else {
            epc_hex = epc_hex.toUpperCase();
            if(epc_list.indexOf(epc_hex) >= 0) {
              filtered_list.push(epc_hex);
            } else {
              err = 'The specified EPC `' + epc_hex + '` is not supported in the Release Version `' + release + '`.';
            }
          }
        });
        epc_list = filtered_list;
      }
      */

      if ('epc' in ins) {
        let list = ins['epc'];
        if (!Array.isArray(list)) {
          err = 'The `epc` must be a non-empty array.';
          break;
        }
        // required の EPC だけを抽出する
        let required_epc_map = {};
        Object.keys(o['elProperties']).forEach((epc_hex) => {
          let epc_data = o['elProperties'][epc_hex];
          let rule = epc_data['accessRule'];
          if (rule) {
            let required = false;
            Object.keys(rule).forEach((r) => {
              //if (rule[r] === 'required') {
              if (rule[r].startsWith('required')) {
                required = true;
              }
            });
            if (!required) {
              return;
            }
          }
          required_epc_map[epc_hex] = true;
        });

        let new_list = [];
        list.forEach((epc_hex) => {
          if (typeof (epc_hex) !== 'string' || !/^[0-9A-Fa-f]{2}$/.test(epc_hex)) {
            err = 'Each element in the `epc` must be `FF` format.';
          } else {
            epc_hex = epc_hex.toUpperCase();
            if (epc_list.indexOf(epc_hex) >= 0) {
              new_list.push(epc_hex);
            } else {
              err = 'The specified EPC `' + epc_hex + '` is not supported in the Release Version `' + release + '`.';
            }
          }
        });
        new_list.forEach((epc_hex) => {
          if (!required_epc_map[epc_hex]) {
            required_epc_map[epc_hex] = true;
          }
        });
        epc_list = Object.keys(required_epc_map);
        epc_list.sort();
      }

      if (err) {
        break;
      } else {
        new_eoj_list.push({
          eoj: eoj,
          epc: epc_list,
          release: release
        });
      }
    };

    if (err) {
      return {
        result: 1,
        message: err
      };
    } else {
      return {
        result: 0,
        eojList: new_eoj_list
      };
    }
  }

  /* ------------------------------------------------------------------
  * reset()
  * デバイスをリセットする。
  * - elemu/data/ 内に保存された current_eoj_list.json, state_XXXXXX.json
  *  を削除してから、デバイスを再起動する。
  *
  * 引数
  *   なし
  *
  * 戻値
  *   Promise オブジェクト
  *
  *   resolve() には何も引き渡さない。
  * ---------------------------------------------------------------- */
  reset() {
    return new Promise((resolve, reject) => {
      let status = this.getPowerStatus();
      let dpath = mPath.resolve(__dirname, '../data');
      this.stop().then(() => {
        return this._findFilesToDeleteForReset(dpath);
      }).then((fpath_list) => {
        return this._deleteFiles(fpath_list);
      }).then(() => {
        this._remote_devices = {};
        return this.init();
      }).then(() => {
        if (status === true) {
          this.start().then(() => {
            resolve();
          }).catch((error) => {
            reject(error);
          });
        } else {
          resolve();
        }
      }).catch((error) => {
        reject(error);
      });
    });
  }

  _findFilesToDeleteForReset(dpath) {
    return new Promise((resolve, reject) => {
      mFs.readdir(dpath, function (error, file_list) {
        if (error) {
          reject(error);
          return;
        }
        let target_fname_list = [];
        file_list.forEach((fname) => {
          if (fname === 'current_eoj_list.json' || /^state_[0-9a-fA-F]{6}\.json$/.test(fname)) {
            target_fname_list.push(dpath + '/' + fname);
          }
        });
        resolve(target_fname_list);
      });
    });
  }

  _deleteFiles(fpath_list) {
    return new Promise((resolve, reject) => {
      let list = JSON.parse(JSON.stringify(fpath_list));
      let delFile = (callback) => {
        let fpath = list.shift();
        if (fpath) {
          if (mFs.existsSync(fpath)) {
            mFs.unlink(fpath, (error) => {
              if (error) {
                callback(error);
                return;
              } else {
                delFile(callback);
              }
            });
          } else {
            delFile(callback);
          }
        } else {
          callback();
        }
      };
      delFile((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  /* ------------------------------------------------------------------
  * getCurrentEojList()
  * 現在セットされている EOJ 情報のリストを取得する
  *
  * 引数:
  *   なし
  *
  * 戻値:
  *   this._current_eoj_list の内容をそのまま返す
  *     [
  *       {
  *         "eoj": "031001",
  *         "epc": ["80", "81",...],
  *         "release": "J"
  *       },
  *       ...
  *     ]
  * ---------------------------------------------------------------- */
  getCurrentEojList() {
    return JSON.parse(JSON.stringify(this._current_eoj_list));
  }

  /* ------------------------------------------------------------------
  * getCurrentEoj(epc)
  * 現在セットされている EOJ 情報のリストから指定の EOJ の情報を取得する
  *
  * 引数:
  *   epc: EPC の 16 進数文字列
  *
  * 戻値:
  *   this._current_eoj_list のうち、指定の EOJ に該当するオブジェクトの
  *   内容をそのまま返す。
  *     { "eoj": "031001", "epc": ["80", "81",...]},
  *   もし指定の EOJ が見つからなければ null を返す。
  * ---------------------------------------------------------------- */
  getCurrentEoj(eoj) {
    eoj = eoj.toUpperCase();
    let o = null;
    for (let i = 0, len = this._current_eoj_list.length; i < len; i++) {
      let obj = this._current_eoj_list[i];
      if (obj['eoj'] === eoj) {
        o = JSON.parse(JSON.stringify(obj));
        break;
      }
    }
    return o;
  }

  /* ------------------------------------------------------------------
  * addCurrentEoj(params)
  * EOJ 情報を追加してデバイスを再起動する。
  *
  * - ノードプロファイル (EOJ: 0x0EF0XX) を指定すると、既存のノードプロ
  *   ファイルを置き換える。
  * - コントローラー (EOJ: 0x05FFXX) を登録する場合は、ノードプロファイルを
  *   除くすべての EOJ を事前に削除しておかなければいけない。
  * - コントローラー (EOJ: 0x05FFXX) がすでに登録されている場合は、もう EOJ
  *   は追加できない。
  *
  * 引数:
  * - params
  *   - eoj     | String | required | EOJ の 16 進数文字列
  *   - epc     | Array  | optional | サポートする EPC のリスト
  *             |        |          | 指定がなければ全 EPC をサポート対象とする
  *   - release | String | optional | リリースバージョン (例: "J")
  *             |        |          | 指定がなければ DeviceDescription の
  *             |        |          | リリースバージョンが適用される
  *
  * 戻値:
  * - Promise オブジェクト
  * 
  * 指定された EOJ の値が不正な値だったとしても reject() ではなく resolve() を
  * 呼び出す。reject() が呼び出されるのは、ファイル書き込みに失敗したときなど。
  *
  * resolve() には、結果を表すオブジェクトが渡される:
  *   result    | Interger | 成功なら 0 が、失敗なら 1 がセットされる
  *   data      | Object   | 失敗の場合は存在しない
  *     eoj     | String   | 追加した EOJ
  *     epc     | Array    | 追加した EOJ がサポートする EPC のリスト
  *     release | String   | ECHONET Lite 仕様書 Appendix のリリースバージョン (例: "J")
  *   message   | String   | エラーメッセージ (成功の場合は存在しない)
  * ---------------------------------------------------------------- */
  addCurrentEoj(params) {
    return new Promise((resolve, reject) => {
      let chk = this._checkEojList([params]);
      if (chk['result'] !== 0) {
        resolve(chk);
        return;
      }
      let o = chk['eojList'][0];
      let eoj_hex = o['eoj'];
      if (this.getCurrentEoj(eoj_hex)) {
        resolve({
          result: 1,
          message: 'The specified EOJ has been already registered: ' + eoj_hex
        });
        return;
      }

      let eoj_list = this.getCurrentEojList();

      // 追加したい EOJ がノードプロファイルかどうかをチェック
      let is_node_profile_added = false;
      if (/^0EF0/.test(eoj_hex)) {
        is_node_profile_added = true;
        // インスタンス番号は 01 か 02 のいずれか
        if (!/^0EF0(01|02)$/.test(eoj_hex)) {
          resolve({
            result: 1,
            message: 'The instance number for The node profile class (`0EF0`) must be `01` or `02`.'
          });
          return;
        }
      }

      // いま、コントローラーかどうかを調べる
      let is_controller = false;
      for (let i = 0; i < eoj_list.length; i++) {
        let eoj_data = eoj_list[i];
        if (/^05FF/.test(eoj_data['hex'])) {
          is_controller = true;
          break;
        }
      }
      // コントローラーならノードプロファイル以外の EOJ は追加できない
      if (is_controller) {
        if (!is_node_profile_added) {
          resolve({
            result: 1,
            message: 'When this emulator is started as a controller, no EOJs can be added except a Node Profile.'
          });
          return;
        }
      }

      // コントローラーを追加する場合、ノードプロファイル以外の EOJ が
      // 登録されていないかをチェック
      if (/^05FF/.test(eoj_hex)) {
        let err = '';
        for (let i = 0; i < eoj_list.length; i++) {
          let eoj_data = eoj_list[i];
          if (!/^0EF0/.test(eoj_data['eoj'])) {
            err = 'If you want to add a controller class (EOJ: `' + eoj_hex + '`), delete the other EOJs except the node profile class (EOJ: `0EF0XX`) in advance.';
            break;
          }
        }
        if (err) {
          resolve({
            result: 1,
            message: err
          });
          return;
        }
      }

      // 登録情報を構築
      if (is_node_profile_added) {
        let new_eoj_list = [];
        eoj_list.forEach((eoj_data) => {
          if (/^0EF0/.test(eoj_data['eoj'])) {
            new_eoj_list.push(o);
          } else {
            new_eoj_list.push(eoj_data);
          }
        });
        eoj_list = new_eoj_list;
      } else {
        eoj_list.push(o);
      }
      // 登録処理とデバイス再起動
      this.setCurrentEojList(eoj_list).then((res) => {
        if (res['result'] === 0) {
          res['data'] = this.getCurrentEoj(eoj_hex);
        }
        resolve(res);
      }).catch((error) => {
        reject(error);
      });
    });
  }

  /* ------------------------------------------------------------------
  * updateCurrentEoj(params)
  * EOJ 情報 (EPC リスト) を修正してデバイスを再起動する
  *
  * 引数:
  * - params
  *   - eoj     | String | required | EOJ の 16 進数文字列
  *   - epc     | Array  | optional | サポートする EPC のリスト
  *             |        |          | 指定がなければ全 EPC をサポート対象とする
  *   - release | String | optional | リリースバージョン (例: "J")
  *             |        |          | 指定がなければ DeviceDescription の
  *             |        |          | リリースバージョンが適用される
  *
  * 戻値:
  * - Promise オブジェクト
  * 
  * 指定された EOJ の値が不正な値だったとしても reject() ではなく resolve() を
  * 呼び出す。reject() が呼び出されるのは、ファイル書き込みに失敗したときなど。
  *
  * resolve() には、結果を表すオブジェクトが渡される:
  *   result    | Interger | 成功なら 0 が、失敗なら 1 がセットされる
  *             |          | 指定の EOJ が見つからない場合は 404 がセットされる
  *   data      | Object   | 失敗の場合は存在しない
  *     eoj     | String   | 修正した EOJ
  *     epc     | Array    | 修正した EOJ がサポートする EPC のリスト
  *   message   | String   | エラーメッセージ (成功の場合は存在しない)
  * ---------------------------------------------------------------- */
  updateCurrentEoj(params) {
    return new Promise((resolve, reject) => {
      let chk = this._checkEojList([params]);
      if (chk['result'] !== 0) {
        resolve(chk);
        return;
      }

      let o = chk['eojList'][0];
      let eoj = o['eoj'];

      if (!this.getCurrentEoj(eoj)) {
        resolve({
          result: 404,
          message: 'The specified EOJ has not been registered: ' + eoj
        });
        return;
      }

      let eoj_list = this.getCurrentEojList();
      for (let i = 0, len = eoj_list.length; i < len; i++) {
        if (eoj_list[i]['eoj'] === eoj) {
          eoj_list[i] = o;
        }
      }

      this.setCurrentEojList(eoj_list).then((res) => {
        if (res['result'] === 0) {
          res['data'] = this.getCurrentEoj(eoj);
        }
        resolve(res);
      }).catch((error) => {
        reject(error);
      });
    });
  }

  /* ------------------------------------------------------------------
  * deleteCurrentEoj(epc)
  * 現在セットされている EOJ 情報のリストから指定の EOJ の情報を削除する
  * - ノードプロファイルは削除できない。
  *
  * 引数:
  *   epc: EPC の 16 進数文字列
  *
  * 戻値:
  * - Promise オブジェクト
  * 
  * 指定された EOJ の値が不正な値だったとしても reject() ではなく resolve() を
  * 呼び出す。reject() が呼び出されるのは、ファイル書き込みに失敗したときなど。
  *
  * resolve() には、結果を表すオブジェクトが渡される:
  *   result    | Interger | 成功なら 0 が、失敗なら 1 がセットされる
  *             |          | 指定の EOJ が見つからない場合は 404 がセットされる
  *   data      | Object   | 失敗の場合は存在しない
  *     eoj     | String   | 削除した EOJ
  *     epc     | Array    | 削除した EOJ がサポートする EPC のリスト
  *   message   | String   | エラーメッセージ (成功の場合は存在しない)
  * ---------------------------------------------------------------- */
  deleteCurrentEoj(eoj) {
    return new Promise((resolve, reject) => {
      if (!eoj || typeof (eoj) !== 'string' || !/^([0-9A-Fa-f]{6})$/.test(eoj)) {
        resolve({
          result: 1,
          message: 'The specified EOJ is invalid: ' + eoj
        });
        return;
      }

      eoj = eoj.toUpperCase();
      let o = this.getCurrentEoj(eoj);
      if (!o) {
        resolve({
          result: 404,
          message: 'The specified EOJ has not been registered: ' + eoj
        });
        return;
      }

      if (/^0EF0/.test(eoj)) {
        resolve({
          result: 403,
          message: 'The node profile can not be deleted.'
        });
        return;
      }

      let deleted = JSON.parse(JSON.stringify(o));

      let eoj_list = this.getCurrentEojList();
      let new_eoj_list = [];
      for (let i = 0, len = eoj_list.length; i < len; i++) {
        if (eoj_list[i]['eoj'] !== eoj) {
          new_eoj_list.push(eoj_list[i]);
        }
      }

      this.setCurrentEojList(new_eoj_list).then((res) => {
        if (res['result'] === 0) {
          res['data'] = deleted;
        }
        resolve(res);
      }).catch((error) => {
        reject(error);
      });
    });
  }

  /* ------------------------------------------------------------------
  * setCurrentEojList(eoj_list)
  * EOJ 情報のリストを一括でセットしてデバイスを再起動する
  *
  * - ノードプロファイル (EOJ: 0x0EF001) は自動的に登録されるため、指定する
  *   必要はない (指定することも可能)。
  * - 登録可能なノードプロファイルの EOJ は 0x0EF001 (一般ノード) か
  *   0x0EF002 (送信専用ノード) のいずれか一方のみ。
  * - コントローラー (EOJ: 0x05FFXX) が含まれる場合は、それ以外の EOJ は指定
  *   できない。
  *
  * 引数:
  * - eoj_list = [
  *     {
  *       "eoj": "013001",
  *       "epc": ["80", "81", ...],
  *       "release": "J"
  *     },
  *     ...
  *   ]
  *
  *   - "epc" はオプションで、指定がなければすべての EPC が適用される。
  *   - "epc" は指定するなら 1 つ以上の要素がある Array でなければいけない。
  *   - "release" はオプションで指定がなければ DeviceDescription のリリース
  *     バージョンが適用される。(例: "J")
  *
  * 戻値:
  * - Promise オブジェクト
  * 
  * 指定された EOJ の値が不正な値だったとしても reject() ではなく resolve() を
  * 呼び出す。reject() が呼び出されるのは、ファイル書き込みに失敗したときなど。
  *
  * resolve() には、結果を表すオブジェクトが渡される:
  *   result    | Interger | 成功なら 0 が、失敗なら 1 がセットされる
  *   data      | Object   | 失敗の場合は存在しない
  *     eojList | Array    | 設定した EOJ のリスト
  *   message   | String   | エラーメッセージ (成功の場合は存在しない)
  * ---------------------------------------------------------------- */
  setCurrentEojList(eoj_list) {
    return new Promise((resolve, reject) => {
      // EOJ リストをチェック
      let chk = this._checkEojList(eoj_list);
      if (chk['result'] !== 0) {
        resolve(chk);
        return;
      }
      let checked_eoj_list = chk['eojList'];

      let eoj_hex_map = {};
      let controller_eoj_hex = '';
      let node_profile_num = 0;
      let err = '';
      for (let i = 0; i < checked_eoj_list.length; i++) {
        let eoj_data = checked_eoj_list[i];
        let eoj_hex = eoj_data['eoj'];
        // ノードプロファイルが2つ以上指定されていないかをチェック
        if (/^0EF0/.test(eoj_hex)) {
          node_profile_num++;
          if (node_profile_num > 1) {
            err = node_profile_num + ' node profiles are specified.';
            break;
          }
          // ノードプロファイルのインスタンス番号が 01 か 02 のいずれかであることをチェック
          if (!/^0EF0(01|02)$/.test(eoj_hex)) {
            err = 'The EOJ of the node profile class must be `0x0EF001` or `0x0EF002`.';
            break;
          }
        }

        // EOJ が重複していないかをチェック
        if (eoj_hex in eoj_hex_map) {
          err = 'The EOJ `' + eoj_hex + '` is overlapped.';
          break;
        }
        if (/^05FF/.test(eoj_hex)) {
          controller_eoj_hex = eoj_hex;
        }
        eoj_hex_map[eoj_hex] = eoj_data;
      }
      // コントローラーが指定されているにもかかわらず、ノードプロファイルを除く他の EOJ が指定されていないかをチェック
      let device_eoj_num = 0;
      checked_eoj_list.forEach((eoj_data) => {
        let eoj_hex = eoj_data['eoj'];
        if (!/^(0EF0|05FF)/.test(eoj_hex)) {
          device_eoj_num++;
        }
      });

      if (controller_eoj_hex && device_eoj_num > 0) {
        err = 'When the controller class (EOJ: `' + controller_eoj_hex + '`) is registered, other EOJs can not be registered except a node profile class (0x0EF0XX).';
      }
      if (err) {
        resolve({
          result: 1,
          message: err
        });
        return;
      }

      let status = this.getPowerStatus();
      this.stop().then(() => {
        return this.init(checked_eoj_list);
      }).then(() => {
        let new_eoj_list = this.getCurrentEojList();
        if (status === true) {
          this.start().then(() => {
            resolve({
              result: 0,
              data: {
                eojList: new_eoj_list
              }
            });
          }).catch((error) => {
            reject(error);
          });
        } else {
          resolve({
            result: 0,
            data: {
              eojList: new_eoj_list
            }
          });
        }
      }).catch((error) => {
        reject(error);
      });
    });
  }

  /* ------------------------------------------------------------------
  * start()
  * デバイスを起動する
  * - すでに起動していた場合、何もせずに resolve する。
  * ---------------------------------------------------------------- */
  start() {
    return new Promise((resolve, reject) => {
      this._console.printSysInitMsg('Starting the device...');

      if (this._initialized === false) {
        this._console.printSysInitRes('NG');
        reject(new Error('This object has not been initialized.'));
      }

      if (this._udp) {
        this._console.printSysInitRes('OK');
        resolve();
        return;
      }

      // UDP/Datagram Sockets を生成
      let udp_version = 'udp4';
      if (this._conf['ip_address_version'] === 6) {
        udp_version = 'udp6';
      }
      this._udp = mDgram.createSocket(udp_version);
      this._packet_sender = new mPacketSender(this._conf, this._udp, this._ip_address_utils);

      this._udp.once('error', (error) => {
        this._console.printSysInitRes('NG');
        reject(error);
      });

      this._udp.on('message', (buf, device_info) => {
        this._receivePacket(buf, device_info);
      });

      let port = this._ip_address_utils.getPortNumber();
      this._udp.bind(port, () => {
        this._udp.removeAllListeners('error');
        this._addMembership();

        // インスタンスリスト通知 (EPC: 0xD5) のための EOJ リストを生成
        // (ノードプロファイルを除く EOJ のリスト)
        let eoj_list = [];
        let node_profile_eoj = '';
        this._current_eoj_list.forEach((o) => {
          if (/^0EF0/.test(o['eoj'])) {
            node_profile_eoj = o['eoj'];
          } else {
            eoj_list.push(o['eoj']);
          }
        });


        if (eoj_list.length > 0) {
          // インスタンスリスト通知 (EPC: 0xD5) INF を生成してマルチキャスト送信
          // - 本エミュレーターをコンソールから起動したときに、システム起動完了前に
          //   パケット送受信が発生するのを避けるため、1秒後にマルチキャスト送信
          // - マルチキャスト送信完了を待たずに resolve() する
          setTimeout(() => {
            this._sendInstanceListNotification(node_profile_eoj, eoj_list, (error) => {
              if (error) {
                console.error(error);
                process.exit();
              }
              this.onpowerstatuschanged({
                powerStatus: true
              });
              // EOJ が送信専用ノード (0x0EF002) なら定期的に送信
              if (node_profile_eoj === '0EF002') {
                this.instance_announce_timer = setInterval(() => {
                  this._sendInstanceListNotification(node_profile_eoj, eoj_list);
                }, this._conf['instance_announce_interval_sec'] * 1000);
              }
            });
          }, 1000);

          // EOJ が送信専用ノード (0x0EF002) なら定期的にプロパティ通知を送信
          if (node_profile_eoj === '0EF002') {
            setTimeout(() => {
              this._sendPropertyNotification(eoj_list);
              this.property_announce_timer = setInterval(() => {
                this._sendPropertyNotification(eoj_list);
              }, this._conf['property_announce_interval_sec'] * 1000);
            }, 2000);
          }
        }

        this._console.printSysInitRes('OK');
        this.onpowerstatuschanged({
          powerStatus: true
        });

        // IPv6 モードならマルチキャスト送信のネットワークインタフェースをセット
        if (this._conf['ip_address_version'] === 6) {
          this.setMulticastInterface6();
        }

        resolve();
      });
    });
  }

  // IPv6 モードならマルチキャスト送信のネットワークインタフェースをセット
  setMulticastInterface6() {
    if (this._conf['ip_address_version'] !== 6) {
      return;
    }
    let scope_list = this._ip_address_utils.getNetworkScopeList();
    scope_list.forEach((s) => {
      this._udp.setMulticastInterface(s);
    });
  }

  _sendInstanceListNotification(node_profile_eoj, eoj_list, callback) {
    if (!callback) {
      callback = () => { };
    }
    let buf = this._createInstanceListNotificationPacket(node_profile_eoj, eoj_list);
    this.send(null, buf).then(() => {
      callback(null);
    }).catch((error) => {
      callback(error);
      console.error(error);
    });
  }

  // 送信専用ノードの場合にプロパティ通知を送信
  _sendPropertyNotification(eoj_list) {
    // eoj_list = ["000D01"]
    if (this.is_sending_property_notification) {
      return;
    }

    let devobjs = {};
    eoj_list.forEach((eoj_hex) => {
      let devobj = this._device_objects[eoj_hex];
      if (devobj) {
        devobjs[eoj_hex] = devobj;
      }
    });
    if (eoj_list.length === 0) {
      return;
    }

    this.is_sending_property_notification = true;

    let common_desc = this._mDeviceDescription.getCommon();

    let propdescs = {};
    for (let eoj_hex in devobjs) {
      let eoj_desc = this._mDeviceDescription.getEoj(eoj_hex);
      let pdescs = {}
      // スーパークラスのプロパティ (common) を除外
      for (let epc_hex in eoj_desc['elProperties']) {
        if (!common_desc['elProperties'][epc_hex]) {
          pdescs[epc_hex] = eoj_desc['elProperties'][epc_hex];
        }
      }
      propdescs[eoj_hex] = pdescs;
    }

    let target_eoj_list = Object.keys(devobjs);
    let packet_buf_list = [];
    let getEpcValuesAndAnnounce = (callback) => {
      let eoj_hex = target_eoj_list.shift();
      if (!eoj_hex) {
        callback();
        return;
      }
      let devobj = devobjs[eoj_hex];
      let props = [];
      for (let epc_hex in propdescs[eoj_hex]) {
        props.push({ epc: epc_hex, edt: null });
      }
      devobj.getEpcValues(props, true).then((res) => {
        let vals = res['vals'];
        for (let epc_hex in vals) {
          let edt_hex = vals[epc_hex];
          if (!edt_hex) {
            continue;
          }
          let buf = mPacketComposer.compose({
            seoj: eoj_hex,
            deoj: '0EF001',
            esv: 'INF',
            properties: [
              {
                epc: epc_hex,
                edt: edt_hex
              }
            ]
          });
          packet_buf_list.push(buf);
        }
        getEpcValuesAndAnnounce(callback);
      }).catch((error) => {
        console.error(error);
        getEpcValuesAndAnnounce(callback);
      });
    };
    getEpcValuesAndAnnounce(() => {
      let sendPacket = (callback) => {
        let buf = packet_buf_list.shift();
        if (!buf) {
          callback();
          return;
        }
        this.send(null, buf).then(() => {
          sendPacket(callback);
        }).catch((error) => {
          console.error(error);
          sendPacket(callback);
        });
      };
      sendPacket(() => {
        this.is_sending_property_notification = false;
      });
    });
  }

  // EL パケットを受信したときの処理
  _receivePacket(buf, device_info) {
    // 送信元アドレス
    let address = device_info.address;
    // 自分自身が送信したパケットなら無視
    if (this._ip_address_utils.isLocalAddress(address)) {
      return;
    }

    // EL パケットをパース
    let parsed = this._parser.parse(buf);

    // コンソールに出力
    if (this._conf['console-packet'] === true) {
      if (parsed['result'] === 0) {
        this._console.printPacketRx(address, parsed['data']['hex']);
      } else {
        this._console.printPacketRx(address, parsed['hex']);
      }
    }

    // パースに失敗した場合
    if (parsed['result'] !== 0) {
      // パケットエラーログに出力
      if (this._packet_logger) {
        this._packet_logger.rxError(address, parsed);
      }
      // `err` が `OPC_OVERFLOW` なら SNA を返す
      if (parsed['err'] === 'OPC_OVERFLOW') {
        if (parsed['data']) {
          this._sendSnaForOpcOverflow(address, parsed);
        }
      }
      // EL パケット受信イベントハンドラを呼び出す
      this.onreceived(address, parsed);
      return;
    }

    // 自身がコントローラーの場合
    // リモートデバイス側の規格 Version 情報が分かっていれば、再度、パケットをパースしなおす
    if (this._is_controller) {
      let tid = parsed['data']['data']['tid']['hex'];
      if (this._request_release_map[tid]) {
        let release = this._request_release_map[tid];
        parsed = this._parser.parse(buf, release);
        delete this._request_release_map[tid];
      }
    }

    // EL パケットをログに出力
    if (this._packet_logger) {
      this._packet_logger.rx(address, parsed);
    }
    // 対象のデバイスオブジェクトがあれば情報を送る
    let el = parsed['data']['data'];
    let deoj = el['deoj']['hex'];
    if (/00$/.test(deoj)) {
      let c = deoj.substr(0, 4);
      Object.keys(this._device_objects).forEach((eoj) => {
        if (c === eoj.substr(0, 4)) {
          this._device_objects[eoj].receive(address, parsed);
        }
      });
    } else {
      if (this._device_objects[deoj]) {
        this._device_objects[deoj].receive(address, parsed);
      }
    }

    // EL パケット受信イベントハンドラを呼び出す
    this.onreceived(address, parsed);

    // リモートデバイスの状変アナウンス (ESV: 0x73) ならリモートデバイス EPC 更新イベントハンドラを呼び出す
    if (el['esv']['hex'] === '73') {
      let prop_list = [];
      el['properties'].forEach((p) => {
        prop_list.push({
          epc: p['epc']['hex'],
          propertyName: p['epc']['propertyName'],
          edt: p['edt']
        });
      });
      if (prop_list.length > 0) {
        let seoj = el['seoj']['hex'];
        this.onremoteepcupdated({
          address: address,
          eoj: seoj,
          elProperties: prop_list
        });
      }
    }

    // コントローラーの場合
    if (this._is_controller) {
      this._receivePacketForController(parsed, device_info);
    }
  }

  _addMembership() {
    /*
    if(this._conf['ip_address_version'] !== 4) {
      return;
    }
    */
    try {
      let netif_list = this._ip_address_utils.getNetworkInterfaceList();
      let mc_address = this._ip_address_utils.getMulticastAddress();
      netif_list.forEach((netif) => {
        try {
          this._udp.addMembership(mc_address, netif);
        } catch (error) {
          //this._console.printError('Failed to join the multicast group on the network interface `' + netif + '`.', error);
        }
      });
    } catch (e) { }
  }

  _dropMembership() {
    /*
    if(this._conf['ip_address_version'] !== 4) {
      return;
    }
    */
    try {
      let netif_list = this._ip_address_utils.getNetworkInterfaceList();
      let mc_address = this._ip_address_utils.getMulticastAddress();
      netif_list.forEach((netif) => {
        try {
          this._udp.dropMembership(mc_address, netif);
        } catch (error) {
          //this._console.printError('Failed to leave the multicast group on the network interface `' + netif + '`.', error);
        }
      });
    } catch (e) { }
  }

  _createInstanceListNotificationPacket(seoj, eoj_list) {
    /* -------------------------------------------------------
    * ECHONET Lite 仕様書
    * - 第5部 4.2 ノードからコントローラへのメッセージ送信による検出
    * - 第2部 4.3.1 ECHONET Lite ノードスタート時の基本シーケンス
    * - 第2部 6.11.1 ノードプロファイルクラス詳細規定
    * ----------------------------------------------------- */
    if (!seoj || !/^0EF00(1|2)$/.test(seoj)) {
      seoj = '0EF001';
    }
    let edt = Buffer.from([eoj_list.length]).toString('hex') + eoj_list.join('');
    let buf = mPacketComposer.compose({
      seoj: seoj,
      deoj: '0EF001',
      esv: 'INF',
      properties: [
        {
          epc: 'D5',
          edt: edt
        }
      ]
    });
    return buf;
  }

  /* ------------------------------------------------------------------
  * stop()
  * デバイスを停止する
  * - すでに停止していた場合、何もせずに resolve する。
  * ---------------------------------------------------------------- */
  stop() {
    return new Promise((resolve, reject) => {
      this._console.printSysInitMsg('Stopping the device...');
      if (this.instance_announce_timer) {
        clearInterval(this.instance_announce_timer);
      }
      if (this.property_announce_timer) {
        clearInterval(this.property_announce_timer);
      }
      if (this._udp) {
        this._udp.removeAllListeners('error');
        this._udp.removeAllListeners('message');
        this._dropMembership();
        this._udp.close(() => {
          this._udp = null;
          this.onpowerstatuschanged({
            powerStatus: false
          });
          this._console.printSysInitRes('OK');
          resolve();
        });
      } else {
        this._udp = null;
        this.onpowerstatuschanged({
          powerStatus: false
        });
        this._console.printSysInitRes('OK');
        resolve();
      }
    });
  }

  /* ------------------------------------------------------------------
  * getPowerStatus()
  * デバイスの電源状態を取得する
  * ---------------------------------------------------------------- */
  getPowerStatus() {
    return this._udp ? true : false;
  }

  /* ------------------------------------------------------------------
  * sendPacket(address, packet)
  * パケットを送信
  *
  * 引数
  *   - address:
  *       送信先 IP アドレス
  *   - packet:
  *       EL パケットを表すハッシュオブジェクト
  *
  * - packet       | Object  | required |
  *   - tid        | integer | optional | 指定がなけれは自動採番
  *   - seoj       | string  | required | 16進数文字列 (例: "013001")
  *   - deoj       | string  | required | 16進数文字列 (例: "05FF01")
  *   - esv        | string  | required | ESV キーワード (例: "GET_RES") または 16進数文字列
  *   - properties | array   | required | object のリスト
  *     - epc      | string  | required | EPCの16進数文字列 (例: "80")
  *     - edt      | string  | optional | EDTの16進数文字列
  *
  * 戻値
  *   Promise オブジェクトを返す
  *   reject() には以下のハッシュオブジェクトを引き渡す:
  *
  *   {
  *     result: 0, // 0: 成功, 1: パラメーターエラー
  *     message: 'エラーメッセージ', // 成功時には null
  *     hex: "1081000205FF010EF0006201D600", // 送信パケットの16進数文字列,
  *     data: {} // 送信パケットをパース下結果
  *   }
  *
  *   パラメーターエラーの場合は、reject() ではなく resolve() を呼び出す
  *   reject() を呼び出すのは、UDP パケット送信エラーの場合のみ
  * ---------------------------------------------------------------- */
  sendPacket(address, packet) {
    return new Promise((resolve, reject) => {
      let buf = mPacketComposer.compose(packet);
      if (!buf) {
        let error = mPacketComposer.error;
        let message = 'Failed to create a Packet Buffer object: ';
        if (error) {
          message += error.message;
        }
        resolve({
          result: 1,
          message: message
        });
        return;
      }
      this.send(address, buf).then((parsed) => {
        resolve(parsed);
      }).catch((error) => {
        reject(error);
      });
    });
  }

  /* ------------------------------------------------------------------
  * send(address, buf)
  * パケットを送信する
  *
  * EL パケットを表す Buffer オブジェクトを引数に取るローレベルメソッド。
  * ハイレベルメソッドは sendPacket() メソッドを使うこと。
  * ---------------------------------------------------------------- */
  send(address, buf) {
    return new Promise((resolve, reject) => {
      this._packet_sender.send(address, buf).then((dest_addr) => {
        // EL パケットをパース
        let parsed = this._parser.parse(buf);

        if (parsed) {
          // SEOJ から規格 Version 情報が判明すれば、再度、パースし直す
          let seoj = parsed['data']['data']['seoj']['hex'];
          if (!/^0EF0/.test(seoj)) {
            let release = '';
            this._current_eoj_list.forEach((info) => {
              if (info['eoj'] === seoj) {
                if (info['release']) {
                  release = info['release'];
                }
              }
            });
            if (release) {
              parsed = this._parser.parse(buf, release);
            }
          }
        }

        // コンソールに出力
        if (this._conf['console-packet'] === true) {
          if (parsed['result'] === 0) {
            this._console.printPacketTx(dest_addr, parsed['data']['hex']);
          } else {
            this._console.printPacketTx(dest_addr, parsed['hex']);
          }
        }

        // EL パケットをログに出力
        if (this._packet_logger) {
          this._packet_logger.tx(dest_addr, parsed);
        }
        // コントローラーの EL パケット送信イベントハンドラを呼び出す
        this.onsent(dest_addr, parsed);
        resolve(parsed);
      }).catch((error) => {
        // パケットエラーログに出力
        if (this._packet_logger) {
          let dest_addr = address;
          if (!address) {
            dest_addr = this._ip_address_utils.getMulticastAddress();
          }
          this._packet_logger.txError(dest_addr, {
            message: error.message,
            hex: buf.toString('hex').toUpperCase()
          });
        }
        reject(error);
      });
    });
  }

  _sendSnaForOpcOverflow(address, parsed) {
    let d = parsed['data']['data'];
    let esv = el['esv']['hex'];
    let esv1 = esv.substr(0, 1);
    let esv2 = esv.substr(1, 1);
    if (esv1 !== '6' || esv !== '74') {
      return;
    }
    let packet = {
      tid: parseInt(d['tid'], 16),
      seoj: d['deoj']['hex'], // DEOJ と SDOJ をひっくり返す
      deoj: d['seoj']['hex'],
      esv: '5' + esv2,
      properties: []
    };

    let props = d['properties'];
    for (let i = 0, len = props.length; i < len; i++) {
      let prop = props[i];
      packet['properties'].push({
        epc: prop['epc']['hex'],
        edt: props['edt']['hex']
      });
    }

    let buf = mPacketComposer.compose(packet);
    if (!buf) {
      return;
    }
    this.send(address, buf).then(() => {
      // Do nothing
    }).catch((error) => {
      // Do nothing
    });
  }

  /* ------------------------------------------------------------------
  * getEpcValues(eoj, props)
  * EPC の値 (EDT) を読みだす (ダッシュボード向け)
  *
  * 引数:
  * - eoj      | String  | required |
  *     - エミュレート中のインスタンスの EOJ (例: "013001")
  * - props    | Array   | required |
  *     - 例: [{"epc": "8A", "edt":"any"}, ...]
  *     - epc の値しか見ないので edt の any の部分は何が入っていても構わない
  *
  * 戻値:
  * - Promise オブジェクト
  *
  * resolve() には、結果を表すオブジェクトが渡される:
  * {
  *    result       : 読み出しに失敗した EDT の数 (つまりすべて成功すれば 0),
  *    message      : エラーメッセージ、エラーがなければ null, 複数の失敗があれば最後のエラーメッセージがセット,
  *    elProperties : プロパティ情報のリスト
  *  }
  *
  * reject() は本メソッドに渡されたパラメータに不備があった場合のみ呼び出される。
  * ---------------------------------------------------------------- */
  getEpcValues(eoj, props) {
    return new Promise((resolve, reject) => {
      let devobj = this._device_objects[eoj];
      if (!devobj) {
        reject(new Error('The specified EPC is not being emulated.'));
        return;
      }
      let release = devobj.getStandardVersion();
      let eoj_desc = this._mDeviceDescription.getEoj(eoj, null, release);
      let pdesc = eoj_desc['elProperties'];

      devobj.getEpcValues(props, true).then((res) => {
        let vals = res['vals'];
        let prop_list = [];
        Object.keys(vals).sort().forEach((epc) => {
          let hex = vals[epc] || null;
          let edt_data = null;
          if (hex) {
            edt_data = { hex: hex };
            let pdata = pdesc[epc]['data'];
            let edt_buf = this._convHexToBuffer(hex);
            let pv = this._parser.parsePropertyValue(pdata, edt_buf, epc, eoj, release);
            edt_data['data'] = pv;
          };
          prop_list.push({
            epc: epc,
            propertyName: pdesc[epc] ? pdesc[epc]['propertyName'] : null,
            edt: edt_data,
            map: devobj.getAccessRule(epc)
          });
        });
        res['elProperties'] = prop_list;
        delete res['vals'];
        resolve(JSON.parse(JSON.stringify(res)));
      }).catch((error) => {
        reject(error);
      });
    });
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

  /* ------------------------------------------------------------------
  * setEpcValues(eoj, props)
  * EPC の値 (EDT) を書き込む (ダッシュボード向け)
  *
  * 引数:
  * - eoj      | String  | required |
  *     - エミュレート中のインスタンスの EOJ (例: "013001")
  * - props    | Array   | required |
  *     - 例: [{"epc": "8A", "edt":"any"}, ...]
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
  setEpcValues(eoj, props) {
    return new Promise((resolve, reject) => {
      let devobj = this._device_objects[eoj];
      if (!devobj) {
        reject(new Error('The specified EPC is not being emulated.'));
        return;
      }
      devobj.setEpcValues(props, true).then((res) => {
        resolve(res);
      }).catch((error) => {
        reject(error);
      });
    });
  }





  /* #######################################################################
  * 以下、コントローラーの場合にのみ有効なメソッド
  * ##################################################################### */

  // EL パケットを受信したときのコントローラーとしての処理
  //   リモートデバイス発見処理
  _receivePacketForController(parsed, device_info) {
    if (!this._is_controller) {
      return;
    }

    let address = device_info['address'];
    let data = parsed['data']['data'];
    let seoj = data['seoj']['hex'];
    let deoj = data['deoj']['hex'];
    let esv = data['esv']['hex'];
    let props = data['properties'];

    // リクエストコールバックがあれば実行して終了
    let tid = parsed['data']['data']['tid']['hex'];
    if (this._request_callback_map[tid]) {
      let cb = this._request_callback_map[tid];
      cb(parsed);
      delete this._request_callback_map[tid];
      return;
    }

    let epcs = {};
    for (let i = 0; i < props.length; i++) {
      let p = props[i];
      let epc_hex = p['epc']['hex'];
      let edt = p['edt'];
      if (edt) {
        epcs[epc_hex] = edt;
      }
    }

    // ESV が 状変アナウンス (ESV: 0x73) の場合
    if (esv === '73') {
      // 既知のリモートデバイスですでに発見処理が終わっている場合
      if (this._remote_devices[address]) {
        // 発見済みリモートデバイスの EDT を更新する
        let rdev = this._remote_devices[address];
        for (let i = 0; i < rdev['eojList'].length; i++) {
          let eoj_data = rdev['eojList'][i];
          if (eoj_data['eoj'] === seoj) {
            eoj_data['elProperties'].forEach((p) => {
              let epc = p['epc'];
              if (epcs[epc]) {
                p['edt'] = epcs[epc];
              }
            });
            break;
          }
        }
      }
    }

    if (address in this._remote_devices) {
      // 登録済みのリモートデバイスならEOJをチェック
      // - 同じIPアドレスなのに未知のEOJからのパケットなら、IPアドレスが
      //   別のデバイスに入れ替わったと判定する
      let rdev = this._remote_devices[address];
      if (rdev) {
        let is_known = false;
        for (let i = 0; i < rdev['eojList'].length; i++) {
          let eoj_data = rdev['eojList'][i];
          if (eoj_data['eoj'] === seoj) {
            is_known = true;
            break;
          }
        }
        if (is_known) {
          // 既知のデバイスなので、ここで終了
          return;
        } else {
          this.ondisappeared({
            id: rdev['id'],
            address: address
          });
          delete this._remote_devices[address];
        }
      } else {
        // null ならリモートデバイス調査中なので、ここで終了
        return;
      }
    }

    // 以降の処理は、未知のリモートデバイスの調査処理

    // ESV が GetRes (0x72) かつ EPC が自ノードインスタンスリストS (0xD6)の場合
    // ESV が INF (0x73) かつ EPC がインスタンスリスト通知 (0xD5)の場合
    if ((esv === '72' && epcs['D6']) || (esv === '73' && epcs['D5'])) {
      let edt = epcs['D6'] || epcs['D5'];
      if (!edt) {
        return;
      }

      if (!edt['data']) {
        return;
      }
      let edt_data = edt['data'];
      if (!edt_data['object'] || !Array.isArray(edt_data['object']) || edt_data['object'].length < 2) {
        return;
      }
      if (edt_data['object'][1]['name'] !== 'instanceList' || !edt_data['object'][1]['array']) {
        return;
      }

      // 現在、リモートデバイス調査中ということを表すために、あえて null をセットしておく。
      this._remote_devices[address] = null;

      let class_names = {};
      let is_known_classes = {};
      let eoj_list = [seoj];
      edt_data['object'][1]['array'].forEach((o) => {
        let eoj_hex = o['raw'];
        if (o['className']) {
          class_names[eoj_hex] = o['className'];
          is_known_classes[eoj_hex] = true;
        } else {
          class_names[eoj_hex] = {
            ja: '不明',
            en: 'Unknown'
          };
          is_known_classes[eoj_hex] = false;
        }
        if (eoj_list.indexOf(eoj_hex) < 0) {
          eoj_list.push(eoj_hex);
        }
      });
      if (data['seoj']['className']) {
        class_names[seoj] = data['seoj']['className'];
        is_known_classes[seoj] = true;
      } else {
        class_names[seoj] = {
          ja: '不明',
          en: 'Unknown'
        };
        is_known_classes[seoj] = false;
      }

      let eojs = {};
      eoj_list.forEach((eoj) => {
        eojs[eoj] = {
          eoj: eoj,
          className: class_names[eoj],
          manufacturer: null,
          release: '',
          elProperties: null,
          isKnownClass: is_known_classes[eoj]
        };
      });

      let rdev = {
        address: address,
        id: null,
        eojList: []
      };

      // 識別番号 (EPC: 0x83) を取得
      this._getRemoteDeviceId(address).then((id) => {
        rdev['id'] = id;
        // EOJ ごとのプロパティマップを取得
        return this._getRemoteDevicePropertyMaps(address, eoj_list);
      }).then((maps) => {
        Object.keys(maps).forEach((eoj) => {
          eojs[eoj]['elProperties'] = maps[eoj];
        });
        // EOJ ごとの規格 Version 情報 (リリース番号) を取得
        return this._getRemoteDeviceReleases(address, eoj_list);
      }).then((rels) => {
        Object.keys(rels).forEach((eoj) => {
          eojs[eoj]['release'] = rels[eoj];
        });
        // EOJ ごとのメーカーコードを取得
        return this._getRemoteDeviceManufacturerCodes(address, eoj_list);
      }).then((manus) => {
        Object.keys(manus).forEach((eoj) => {
          eojs[eoj]['manufacturer'] = manus[eoj];
        });
        Object.keys(eojs).forEach((eoj) => {
          rdev['eojList'].push(eojs[eoj]);
        });

        this._remote_devices[address] = rdev;
        this.ondiscovered(JSON.parse(JSON.stringify(rdev)));
      }).catch((error) => {
        if (this._remote_devices[address] === null) {
          delete this._remote_devices[address];
        }
        console.error(error);
      });
    } else {
      // Node profile に対して自ノードインスタンスリストS (EPC: 0xD6) Get を送信
      let packet = {
        seoj: this._controller_eoj,
        deoj: '0EF000',
        esv: '62',
        properties: [{
          epc: 'D6',
          edt: null
        }]
      };

      this.sendPacket(address, packet).then(() => {
        // Do nothing
      }).catch((error) => {
        console.error('Failed to send a multicast packet for getting the Self-node Instance List S from node profiles.');
        console.error(error);
      });
    }
  }

  _isSameEojList(r1, r2) {
    let eojs2 = {};
    r2['eojList'].forEach((e) => {
      eojs2[e['eoj']] = true;
    });
    let is_same = true;
    r1['eojList'].forEach((e) => {
      let eoj = e['eoj'];
      if (eojs2[eoj]) {
        delete eojs2[eoj];
      } else {
        is_same = false;
      }
    });
    if (Object.keys(eojs2).length > 0) {
      is_same = false;
    }
    return is_same;
  }

  _getRemoteDeviceId(address) {
    return new Promise((resolve, reject) => {
      let packet = {
        seoj: this._controller_eoj,
        deoj: '0EF001',
        esv: '62',
        properties: [{
          epc: '83',
          edt: null
        }]
      };
      this._request(address, packet).then((res) => {
        if (res['result'] === 0) {
          let prop = res['data']['data']['properties'][0];
          if (prop && prop['epc']['hex'] === '83' && prop['edt']['hex']) {
            setTimeout(() => {
              resolve(prop['edt']['hex']);
            }, this._request_interval_msec);
          } else {
            reject(new Error('Failed to get the Identification number (EPC: 0x83) from ' + address));
          }
        } else {
          reject(new Error('Failed to get the Identification number (EPC: 0x83) from ' + address + ': ' + res['message']));
        }
      }).catch((error) => {
        reject(error);
      });
    });
  }

  _getRemoteDevicePropertyMaps(address, eoj_list) {
    let eoj_code_list = JSON.parse(JSON.stringify(eoj_list));
    return new Promise((resolve, reject) => {
      let maps = {};
      let getPropertyMaps = () => {
        let eoj = eoj_code_list.shift();
        if (!eoj) {
          resolve(maps);
          return;
        }
        this._getRemoteDeviceEojPropertyMaps(address, eoj, (error, map) => {
          if (error) {
            reject(error);
          } else {
            maps[eoj] = map;
            getPropertyMaps();
          }
        });
      };
      getPropertyMaps();
    });
  }

  _getRemoteDeviceEojPropertyMaps(address, eoj, callback) {
    let epc_list = ['9F', '9E', '9D']; // Get, Set, Inf プロパティマップの EPC
    let key_list = ['get', 'set', 'inf'];
    let map = {
      get: [],
      set: [],
      inf: []
    };
    let getPropertyMap = (cb) => {
      let epc = epc_list.shift();
      if (!epc) {
        // map の get, set, inf をマージ
        let props = {};
        for (let k in map) {
          map[k].forEach((d) => {
            let epc = d['epc'];
            if (!props[epc]) {
              props[epc] = {
                epc: epc,
                propertyName: d['propertyName'],
                map: {
                  get: false,
                  set: false,
                  inf: false
                },
                edt: null
              }

            }
            props[epc]['map'][k] = true;
          });
        }
        let epc_list = Object.keys(props);
        epc_list.sort();
        let prop_list = [];
        epc_list.forEach((epc) => {
          prop_list.push(props[epc]);
        });
        cb(null, prop_list);
        return;
      }
      let key = key_list.shift();

      let packet = {
        seoj: this._controller_eoj,
        deoj: eoj,
        esv: '62',
        properties: [{
          epc: epc,
          edt: null
        }]
      };
      this._request(address, packet).then((parsed) => {
        let prop = parsed['data']['data']['properties'][0];
        if (prop && prop['epc']['hex'] === epc && prop['edt']['data'] && prop['edt']['data']['propertyList']) {
          let epc_list = [];
          prop['edt']['data']['propertyList'].forEach((d) => {
            epc_list.push(d);
          });
          map[key] = epc_list;
        }
        setTimeout(() => {
          getPropertyMap(cb);
        }, this._request_interval_msec);
      }).catch((error) => {
        //cb(new Error('Failed to fetch the ' + key + ' property map from the EOJ ' + eoj + ' of ' + address + ': ' + error.message));
        console.error(new Error('Failed to fetch the ' + key + ' property map from the EOJ ' + eoj + ' of ' + address + ': ' + error.message));
        setTimeout(() => {
          getPropertyMap(cb);
        }, this._request_interval_msec);
      });
    };
    getPropertyMap((error, prop_list) => {
      callback(error, prop_list);
    });
  }

  _getRemoteDeviceReleases(address, eoj_list) {
    let eoj_code_list = JSON.parse(JSON.stringify(eoj_list));
    return new Promise((resolve, reject) => {
      let rels = {};
      let getRelease = () => {
        let eoj = eoj_code_list.shift();
        if (!eoj) {
          resolve(rels);
          return;
        }

        // ノードプロファイルの場合は除外
        if (/^0EF0/.test(eoj)) {
          getRelease();
          return;
        }

        let epc = '82';
        let packet = {
          seoj: this._controller_eoj,
          deoj: eoj,
          esv: '62',
          properties: [{
            epc: epc,
            edt: null
          }]
        };
        this._request(address, packet).then((parsed) => {
          let prop = parsed['data']['data']['properties'][0];
          if (prop && prop['epc']['hex'] === epc && prop['edt']['data'] && prop['edt']['data']['release']) {
            rels[eoj] = prop['edt']['data']['release'];
          }
          setTimeout(() => {
            getRelease();
          }, this._request_interval_msec);
        }).catch((error) => {
          console.error(new Error('Failed to fetch the standard version information from the EOJ ' + eoj + ' of ' + address + ': ' + error.message));
          setTimeout(() => {
            getRelease();
          }, this._request_interval_msec);
        });
      };
      getRelease();
    });
  }

  _getRemoteDeviceManufacturerCodes(address, eoj_list) {
    let eoj_code_list = JSON.parse(JSON.stringify(eoj_list));
    return new Promise((resolve, reject) => {
      let manus = {};
      let getManufacturerCode = () => {
        let eoj = eoj_code_list.shift();
        if (!eoj) {
          resolve(manus);
          return;
        }

        let epc = '8A';
        let packet = {
          seoj: this._controller_eoj,
          deoj: eoj,
          esv: '62',
          properties: [{
            epc: epc,
            edt: null
          }]
        };
        this._request(address, packet).then((parsed) => {
          let prop = parsed['data']['data']['properties'][0];
          if (prop && prop['epc']['hex'] === epc && prop['edt']['data'] && prop['edt']['data']['manufacturerName']) {
            manus[eoj] = {
              code: prop['edt']['hex'],
              name: prop['edt']['data']['manufacturerName']
            };
          } else {
            manus[eoj] = {
              code: prop['edt']['hex'],
              name: ''
            };
          }
          setTimeout(() => {
            getManufacturerCode();
          }, this._request_interval_msec);
        }).catch((error) => {
          console.error(new Error('Failed to fetch the manufacturer code from the EOJ ' + eoj + ' of ' + address + ': ' + error.message));
          setTimeout(() => {
            getManufacturerCode();
          }, this._request_interval_msec);
        });
      };
      getManufacturerCode();
    });
  }

  _request(address, packet, release) {
    return new Promise((resolve, reject) => {
      let retry_limit = this._request_retry_limit;
      let retry = -1;
      let last_error = null;

      let send = (callback) => {
        let tid = '';
        retry++;
        if (retry > retry_limit) {
          let cb = this._request_callback_map[tid];
          if (cb) {
            delete this._request_callback_map[tid];
          }
          callback(last_error);
          return;
        }

        let timer = setTimeout(() => {
          last_error = new Error('TIMEOUT: ' + address);
          send(callback);
        }, this._requiest_timeout_msec);

        this.sendPacket(address, packet).then((sent_parsed) => {
          if (sent_parsed['result'] !== 0) {
            callback(new Error(sent_parsed['message']));
            return;
          }
          tid = sent_parsed['data']['data']['tid']['hex'];
          this._request_callback_map[tid] = (parsed) => {
            if (timer) {
              clearTimeout(timer);
            }
            callback(null, parsed);
          };
          if (release) {
            this._request_release_map[tid] = release;
          }
        }).catch((error) => {
          last_error = error;
          send(callback);
        });
      };

      send((error, parsed) => {
        if (error) {
          reject(error);
        } else {
          resolve(parsed);
        }
      });
    });
  }

  /* ------------------------------------------------------------------
  * getRemoteDeviceList()
  * 現時点で認識しているリモートデバイス情報のリストを返す
  *
  * 引数:
  *   なし
  *
  * 戻値:
  *   以下のプロパティを含んだハッシュオブジェクト
  *
  *   result           | Integer | 0 なら成功、1 なら失敗
  *   code             | Integer | HTTP ステータスコード
  *                    |         | - 200 : 成功
  *                    |         | - 403 : コントローラーでない
  *   message          | String  | 失敗の場合に理由がセットされる。成功時は null。
  *   remoteDeviceList | Array   | リモートデバイスの情報を格納した配列
  *                    |         | 失敗時は null がセットされる
  *
  * リモートデバイスの情報は以下のハッシュオブジェクト:
  *  {
  *    "address": "192.168.11.4", // IP アドレス
  *    "id": "FE00001BF0761C95FB1800000000000000", // 識別番号
  *    "eojList: [
  *      {
  *        "eoj": "0EF001",
  *        "className": {
  *          "ja": "ノードプロファイル",
  *          "en": "Node Profile"
  *        },
  *        "manufacturer": {
  *          "code": "00001B",
  *          "name": {
  *            "ja": "東芝ライテック株式会社",
  *            "en": "Toshiba Lighting & Technology Corporation"
  *        },
  *        "release": "J",
  *        "elProperties": [
  *          {
  *            "epc": "80",
  *            "propertyName": {
  *              "ja": "動作状態",
  *              "en": "Operation status"
  *            },
  *            "map": {
  *              "get": true,
  *              "set": false,
  *              "inf": true
  *            },
  *            edt: null
  *          },
  *          ...
  *        ]
  *      },
  *      ...
  *    ]
  *  }
  * ---------------------------------------------------------------- */
  getRemoteDeviceList() {
    if (!this._is_controller) {
      return {
        result: 1,
        code: 403,
        message: 'This method is available only when this emulator is set as a EL Controller.',
        remoteDeviceList: null
      };
    }
    let list = [];
    Object.keys(this._remote_devices).forEach((address) => {
      let rdev = this._remote_devices[address];
      if (rdev) {
        list.push(rdev);
      }
    });
    return {
      result: 0,
      code: 200,
      message: null,
      remoteDeviceList: JSON.parse(JSON.stringify(list))
    };
  }

  /* ------------------------------------------------------------------
  * deleteRemoteDeviceList()
  * 現時点で認識しているリモートデバイス情報のリストをクリアする
  *
  * 引数:
  *   なし
  *
  * 戻値:
  *   以下のプロパティを含んだハッシュオブジェクト
  *
  *   result           | Integer | 0 なら成功、1 なら失敗
  *   code             | Integer | HTTP ステータスコード
  *                    |         | - 200 : 成功
  *                    |         | - 403 : コントローラーでない
  *   message          | String  | 失敗の場合に理由がセットされる。成功時は null。
  * ---------------------------------------------------------------- */
  deleteRemoteDeviceList() {
    if (!this._is_controller) {
      return {
        result: 1,
        code: 403,
        message: 'This method is available only when this emulator is set as a EL Controller.',
        remoteDeviceList: null
      };
    }

    Object.keys(this._remote_devices).forEach((addr) => {
      this.ondisappeared({
        address: addr,
        id: this._remote_devices[addr]['id']
      });
    });

    this._remote_devices = {};

    return {
      result: 0,
      code: 200,
      message: null
    };
  }

  /* ------------------------------------------------------------------
  * sendDiscoveryPacket()
  * 機器発見パケットを送信する
  *
  * 引数:
  *   なし
  *
  * 戻値:
  *   Promise オブジェクト
  *
  *   resolve() には以下のプロパティを含んだハッシュオブジェクトが引き渡される
  *
  *   result  | Integer | 0 なら成功、1 なら失敗
  *   code    | Integer | HTTP ステータスコード (403 or 500)
  *           |         | - 200 : 成功
  *           |         | - 403 : コントローラーでない
  *           |         | - 500 : UDP パケット送信失敗
  *   message | String  | 失敗の場合に理由がセットされる。成功時は null。
  *
  *   reject() が呼び出されることはない。
  * ---------------------------------------------------------------- */
  sendDiscoveryPacket() {
    return new Promise((resolve, reject) => {
      if (!this._is_controller) {
        resolve({
          result: 1,
          code: 403,
          message: 'This method is available only when this emulator is set as a EL Controller.'
        });
        return;
      }

      // Node profile に対して
      // 自ノードインスタンスリストS (EPC: 0xD6) Get を送信
      let packet = {
        seoj: this._controller_eoj,
        deoj: '0EF000',
        esv: '62',
        properties: [{
          epc: 'D6',
          edt: null
        }]
      };

      this.sendPacket(null, packet).then((parsed) => {
        setTimeout(() => {
          resolve({
            result: 0,
            code: 200,
            message: null
          });
        }, 1000);
      }).catch((error) => {
        resolve({
          result: 1,
          code: 500,
          message: error.message
        });
      });
    });
  }

  /* ------------------------------------------------------------------
  * getRemoteDeviceEpcData(address, eoj, epc)
  * リモートデバイスの EPC データ (EDT) を取得する
  *
  * 引数:
  * - address  | String  | required |
  *     - リモートデバイスの IP アドレス (例: "192.168.11.4")
  * - eoj      | String  | required |
  *     - リモートデバイスの EOJ (例: "013001")
  * - epc      | String   | required |
  *     - リモートデバイスの EPC (例: "80")
  *
  * 戻値:
  *   Promise オブジェクト
  *
  *   resolve() には以下のプロパティを含んだハッシュオブジェクトが引き渡される
  *
  *   result   | Integer | 0 なら成功、1 なら失敗
  *   code     | Integer | HTTP ステータスコード (403 or 500)
  *            |         | - 200 : 成功
  *            |         | - 400 : パラメーターエラー
  *            |         | - 403 : コントローラーでない
  *            |         | - 500 : UDP パケット送信失敗
  *   message  | String  | 失敗の場合に理由がセットされる。成功時は null。
  *   elProperty | Object  | パケットの解析結果
  *
  *   reject() が呼び出されることはない。
  * ---------------------------------------------------------------- */
  getRemoteDeviceEpcData(address, eoj, epc) {
    return new Promise((resolve, reject) => {
      if (!this._is_controller) {
        resolve({
          result: 1,
          code: 403,
          message: 'This method is available only when this emulator is set as a EL Controller.'
        });
        return;
      }

      if (!address || typeof (address) !== 'string') {
        resolve({
          result: 1,
          code: 400,
          message: 'The `address` is invalid.'
        });
        return;
      }

      if (!this._remote_devices[address]) {
        resolve({
          result: 1,
          code: 400,
          message: 'The specified `address` is unknown.'
        });
        return;
      }

      if (!eoj || typeof (eoj) !== 'string' || !/^[0-9A-F]{6}$/.test(eoj)) {
        resolve({
          result: 1,
          code: 400,
          message: 'The `eoj` is invalid.'
        });
        return;
      }

      if (!epc || typeof (epc) !== 'string' || !/^[0-9A-F]{2}$/.test(epc)) {
        resolve({
          result: 1,
          code: 400,
          message: 'The `epc` is invalid.'
        });
        return;
      }

      // リモートデバイスの規格 Version 情報を特定
      let release = '';
      this._remote_devices[address]['eojList'].forEach((e) => {
        if (e['eoj'] === eoj) {
          release = e['release'];
        }
      });

      // リクエストパケット
      let packet = {
        seoj: this._controller_eoj,
        deoj: eoj,
        esv: '62',
        properties: [{
          epc: epc,
          edt: null
        }]
      };

      this._request(address, packet, release).then((parsed) => {
        if (parsed['result'] === 0) {
          let d = parsed['data']['data'];
          if (d['esv']['hex'] === '72') {
            let props = d['properties'];
            let prop = null;
            for (let i = 0; i < props.length; i++) {
              let p = props[i];
              if (p['epc']['hex'] === epc) {
                prop = p;
                break;
              }
            }
            if (prop) {
              let eoj_data_list = this._remote_devices[address]['eojList'];
              for (let i = 0; i < eoj_data_list.length; i++) {
                if (eoj_data_list[i]['eoj'] === eoj) {
                  let prop_list = eoj_data_list[i]['elProperties'];
                  for (let j = 0; j < prop_list.length; j++) {
                    if (prop_list[j]['epc'] === epc) {
                      let edt_data = JSON.parse(JSON.stringify(prop['edt']));
                      prop_list[j]['edt'] = edt_data;
                    }
                  }
                  break;
                }
              }

              resolve({
                result: 0,
                code: 200,
                message: null,
                elProperty: prop
              });
            } else {
              resolve({
                result: 1,
                code: 400,
                message: 'The EPC data was not found in the response.'
              });
            }
          } else {
            resolve({
              result: 1,
              code: 400,
              message: 'The ESV of the response is not 0x72 (GET_RES): 0x' + d['esv']['hex']
            });
          }
        } else {
          resolve({
            result: 1,
            code: 400,
            message: parsed['message']
          });
        }
      }).catch((error) => {
        reject(error);
      });
    });
  }

  /* ------------------------------------------------------------------
  * setRemoteDeviceEpcData(address, eoj, epc, edt)
  * リモートデバイスの EPC データ (EDT) をセットする
  * 実際には SetC を送信して Set_Res を受けてから、Get を送信して Get_Res の結果を返す
  *
  * 引数:
  * - address  | String  | required |
  *     - リモートデバイスの IP アドレス (例: "192.168.11.4")
  * - eoj      | String  | required |
  *     - リモートデバイスの EOJ (例: "013001")
  * - epc      | String   | required |
  *     - リモートデバイスの EPC (例: "80")
  * - edt      | String   | required |
  *     - セットしたい EDT の 16 進数文字列 (例: "41")
  *
  * 戻値:
  *   Promise オブジェクト
  *
  *   resolve() には以下のプロパティを含んだハッシュオブジェクトが引き渡される
  *
  *   result   | Integer | 0 なら成功、1 なら失敗
  *   code     | Integer | HTTP ステータスコード (403 or 500)
  *            |         | - 200 : 成功
  *            |         | - 400 : パラメーターエラー
  *            |         | - 403 : コントローラーでない
  *            |         | - 500 : UDP パケット送信失敗
  *   message  | String  | 失敗の場合に理由がセットされる。成功時は null。
  *   property | Object  | パケットの解析結果
  *
  *   reject() が呼び出されることはない。
  * ---------------------------------------------------------------- */
  setRemoteDeviceEpcData(address, eoj, epc, edt) {
    return new Promise((resolve, reject) => {
      if (!this._is_controller) {
        resolve({
          result: 1,
          code: 403,
          message: 'This method is available only when this emulator is set as a EL Controller.'
        });
        return;
      }

      if (!address || typeof (address) !== 'string') {
        resolve({
          result: 1,
          code: 400,
          message: 'The `address` is invalid.'
        });
        return;
      }

      if (!this._remote_devices[address]) {
        resolve({
          result: 1,
          code: 400,
          message: 'The specified `address` is unknown.'
        });
        return;
      }

      if (!eoj || typeof (eoj) !== 'string' || !/^[0-9A-F]{6}$/.test(eoj)) {
        resolve({
          result: 1,
          code: 400,
          message: 'The `eoj` is invalid.'
        });
        return;
      }

      if (!epc || typeof (epc) !== 'string' || !/^[0-9A-F]{2}$/.test(epc)) {
        resolve({
          result: 1,
          code: 400,
          message: 'The `epc` is invalid.'
        });
        return;
      }

      if (!edt || typeof (edt) !== 'string' || !/^[0-9A-F]+$/.test(edt) || edt.length % 2 !== 0) {
        resolve({
          result: 1,
          code: 400,
          message: 'The `edt` is invalid.'
        });
        return;
      }

      // リクエストパケット
      let packet = {
        seoj: this._controller_eoj,
        deoj: eoj,
        esv: '61',
        properties: [{
          epc: epc,
          edt: edt
        }]
      };

      this._request(address, packet).then((parsed) => {
        if (parsed['result'] !== 0) {
          resolve({
            result: 1,
            code: 400,
            message: parsed['message']
          });
          return;
        }
        let d = parsed['data']['data'];
        let esv = d['esv']['hex'];
        if (esv !== '71') {
          resolve({
            result: 1,
            code: 400,
            message: 'The ESV of the response was not 0x71 (SET_RES): 0x' + d['esv']['hex']
          });
          return;
        }
        return this._waitPromise(300);
      }).then(() => {
        return this.getRemoteDeviceEpcData(address, eoj, epc);
      }).then((res) => {
        resolve(res);
      }).catch((error) => {
        reject(error);
      });
    });
  }


  _waitPromise(msec) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve();
      }, msec);
    });
  }

}

module.exports = Device;
