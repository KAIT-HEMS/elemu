/* ----------------------------------------------------------------------------
* elemu.js
* ELエミュレーターのダッシュボード JS
* -------------------------------------------------------------------------- */
'use strict';

document.addEventListener('DOMContentLoaded', () => {
	(new Elemu()).init();
}, false);

/* ----------------------------------------------------------------------------
* Constructor: Elemu()
* -------------------------------------------------------------------------- */
function Elemu() {
	this._webapi = null;
	this._lang = 'ja';
	this._eoj_list = [];
	this._edt_value_data = {};
	this._is_controller = false;

	this.router = null;
	this.app = null;

	this.app_bind_data = {
		lang: 'ja',
		powerStatus: false,
		wsStatus: false
	};

	this.components_bind_data = {
		'home': {
			lang: ''
		},
		'eoj-panel': {
			lang: '',
			eoj: '',
			eoj_list: [],
			epc_list: []
		},
		'send-packet': {
			lang: '',
			address_candidate_list: [],
			device_list: [],
			class_code: '',
			class_name: {
				ja: '',
				en: ''
			},
			epc_list: [],
			packet: {
				address: '',
				tid: '',
				seoj: {
					class_code: '05FF',
					instance: '01'
				},
				deoj: {
					class_code: '',
					instance: '01'
				},
				esv: '62',
				opc: '01',
				epc_1: '',
				edt_1: '',
				epc_2: '',
				edt_2: '',
				epc_3: '',
				edt_3: '',
				epc_4: '',
				edt_4: '',
				epc_5: '',
				edt_5: '',
				epc_6: '',
				edt_6: '',
				epc_7: '',
				edt_7: '',
				epc_8: '',
				edt_8: '',
				epc_9: '',
				edt_9: '',
				epc_10: '',
				edt_10: ''
			},
			edt_disabled: true
		},
		'packet-monitor': {
			lang: '',
			packet_list: [],
			filter1: false,
			paused: false
		},
		'packet-detail': {
			hidden: true,
			lang: '',
			direction: '',
			address: '',
			hex: '',
			data: {
				ehd: {},
				tid: {},
				seoj: {},
				deoj: {},
				esv: {},
				opc: {},
				properties: []
			}
		},
		'conf': {
			lang: '',
			data: {}
		},
		'add-eoj': {
			lang: '',
			eoj: '',
			instance: '',
			eoj_list: [],
			release: '',
			release_list: []
		},
		'edit-eoj': {
			lang: '',
			eoj: '',
			class_name: {
				ja: '',
				en: ''
			},
			all_epc_list: [],
			supported_epc_list: [],
			release: '',
			release_list: []
		},
		'edit-edt': {
			lang: '',
			eoj: '',
			epc: '',
			class_name: {
				ja: '',
				en: ''
			},
			release: '',
			property_name: {
				ja: '',
				en: ''
			},
			description: {},
			description_json: '',
			note: {
				ja: '',
				en: ''
			},
			edt: {},
			inputs: {}
		},
		'remote-device-list': {
			lang: '',
			is_controller: false,
			remote_device_list: []
		},
		'remote-device-detail': {
			lang: '',
			remote_device_list: [],
			device_id_eoj: '',
			address: '',
			device_id: '',
			eoj: '',
			epc_list: [],
			is_loading: false
		}
	};

	this.packet_detail_conponent = null;

	this.app_initialized = false;

	this.packet_no = 1;
	this.packets = {};
	this.active_packet_id = '';

	this.bootstrap_utils = null;

	// DeviceDescription に定義されたデバイスの一覧
	//  - 主に SEOJ や DEOJ の選択に使う
	this.device_list = [];
	// DeviceDescription に定義されたデバイス情報
	//  - 主にパケット送信のEPC選択に使う
	//  - キーはクラスコード
	this.device_details = {};
	// DeviceDescription から得られる有効なリリースバージョンのリスト
	//  - 主に EOJ 登録に使う
	this.release_list = [];

	// リモートデバイスの情報
	//  - キーはデバイス識別ID
	this.remote_devices = {};

}

Elemu.prototype.init = function () {
	$('[data-toggle="tooltip"]').tooltip();
	// Bootstrap のユーティリティオブジェクト
	this.bootstrap_utils = new ElemuBootstrapUtils();
	// EL エミュレーターの WebAPI オブジェクト
	this._webapi = new ElemuWebApi();
	// Vue.js の初期設定
	this.initViews();
	// WebSocket
	this.initWs();
};

Elemu.prototype.initViews = function () {
	let _this = this;
	let routes = [
		{
			path: '/',
			redirect: '/init'
		},
		{
			path: '/init',
			component: {
				template: $('#tmpl-page-init').text(),
				data: () => {
					return {};
				},
				created: () => {
					this.initDashboard();
					window.scrollTo(0, 0);
				},
				watch: {
					'$route': () => {
						this.initDashboard();
						window.scrollTo(0, 0);
					}
				},
			}
		},
		// ホーム画面
		{
			path: '/home',
			component: {
				template: $('#tmpl-page-home').text(),
				data: () => {
					return this.components_bind_data['home'];
				},
				mounted: () => {
					// Bootstrap collapse を有効に
					this.bootstrap_utils.enableCollapse();
				},
				components: {
					// デバイスオブジェクトインスタンスの Vue コンポーネント
					'eoj-panel': {
						template: $('#tmpl-component-eoj-panel').text(),
						data: () => {
							return this.components_bind_data['eoj-panel'];
						},
						methods: {
							// EOJ プルダウンが変更されたときの処理
							updateEoj: this.eojPanelUpdateEoj.bind(this),
							// 削除ボタンがクリックされたときの処理
							deleteEoj: this.eojPanelDeleteEoj.bind(this),
							// 編集ボタンがクリックされたときの処理 (編集画面へリダイレクト)
							editEoj: () => {
								let eoj = this.components_bind_data['eoj-panel']['eoj'];
								this.router.push({ path: '/editEoj/' + eoj })
							},
							// EOJ 新規登録ボタンがクリックされたときの処理 (新規登録画面へリダイレクト)
							showAddEoj: () => {
								this.router.push({ path: '/addEoj' });
							},
							// 再読込ボタンがクリックされたときの処理
							reloadEdt: this.eojPanelReloadEdt.bind(this)
						}
					},
					// リモートデバイス一覧の Vue コンポーネント
					'remote-device-list': {
						template: $('#tmpl-component-remote-device-list').text(),
						data: () => {
							return this.components_bind_data['remote-device-list'];
						},
						methods: {
							// 再読込ボタンが押されたときの処理 (リモートデバイス一覧取得表示)
							reloadList: this.remoteDeviceListReload.bind(this),
							// 発見パケット送信ボタンが押されたときの処理
							sendDiscoveryPacket: this.remoteDeviceListSendDiscoveryPacket.bind(this),
							// リモートデバイスをクリア
							deleteRemoteDevices: this.remoteDeviceListDelete.bind(this)
						}
					},
					// パケット送信の Vue コンポーネント
					'send-packet': {
						template: $('#tmpl-component-send-packet').text(),
						data: () => {
							return this.components_bind_data['send-packet'];
						},
						methods: {
							// SEOJ/DEOJ, ESV のプルダウンが変更されたときの処理 (EPC リストを取得)
							updateEpcList: this.sendPacketUpdateEpcList.bind(this),
							// 送信ボタンが押されたときの処理
							sendPacket: this.sendPacketExec.bind(this),
							// EDT 詳細表示アイコン (i のアイコン) がクリックされたときの処理
							showEdtDetailModal: this.sendPacketShowEdtDetailModal.bind(this)
						}
					},
					// パケットモニターの Vue コンポーネント
					'packet-monitor': {
						template: $('#tmpl-component-packet-monitor').text(),
						data: () => {
							return this.components_bind_data['packet-monitor'];
						},
						methods: {
							// パケット一覧からパケット行がクリックされたときの処理 (パケット詳細を表示)
							showPacketDetail: this.packetMonitorShowPacketDetail.bind(this),
							// パケット一覧から矢印キーが押されたときの処理
							upDownList: this.packetMonitorUpDownList.bind(this),
							// パケット一覧クリアアイコンがクリックされたときの処理
							clearPacketList: this.packetMonitorClearPacketList.bind(this),
							// モニター停止・再開アイコンがクリックされたときの処理
							togglePlayPause: this.packetMonitorTogglePlayPause.bind(this)
						},
						components: {
							// パケット詳細表示の Vue コンポーネント
							'packet-detail': {
								template: $('#tmpl-component-packet-detail').text(),
								data: () => {
									return this.components_bind_data['packet-detail'];
								}
							}
						}
					}
				}
			}
		},
		// システム設定画面
		{
			path: '/conf',
			component: {
				template: $('#tmpl-page-conf').text(),
				data: () => {
					return this.components_bind_data['conf'];
				},
				created: () => {
					window.scrollTo(0, 0);
					this.confShowPage();
				},
				watch: {
					'$route': () => {
						window.scrollTo(0, 0);
						this.confShowPage();
					}
				},
				methods: {
					// 設定ボタンが推されたときの処理
					submitConfig: this.confSubmitConfig.bind(this),
					// システムリセットボタンが押されたときの処理
					resetSystem: this.confResetSystem.bind(this),
					// キャンセル
					cencelConfig: () => {
						this.router.go(-1);
					}
				}
			}
		},
		// EOJ 新規登録画面
		{
			path: '/addEoj',
			component: {
				template: $('#tmpl-page-add-eoj').text(),
				data: () => {
					return this.components_bind_data['add-eoj'];
				},
				created: () => {
					window.scrollTo(0, 0);
					this.addEojShowPage();
				},
				watch: {
					'$route': () => {
						window.scrollTo(0, 0);
						this.addEojShowPage();
					}
				},
				methods: {
					// 登録ボタンが押されたときの処理
					addEoj: this.addEojExec.bind(this)
				}
			}
		},
		// EOJ 編集画面
		{
			path: '/editEoj/:eoj',
			component: {
				template: $('#tmpl-page-edit-eoj').text(),
				data: () => {
					return this.components_bind_data['edit-eoj'];
				},
				created: function () {
					// パス変数の値が必要 (this の問題) なので、意図的にアロー関数を使わない
					window.scrollTo(0, 0);
					_this.editEojShowPage(this.$route.params.eoj);
				},
				watch: {
					'$route': function () {
						window.scrollTo(0, 0);
						_this.editEojShowPage(this.$route.params.eoj);
					}
				},
				methods: {
					// 編集ボタンが押されたときの処理
					editEoj: this.editEojExec.bind(this),
					// リリースバージョンのプルダウンが変更されたときの処理
					releaseChanged: this.editEojReleaseChanged.bind(this)
				}
			}
		},
		// EPC データ (EDT) 編集画面
		{
			path: '/editEdt/:eoj/:epc',
			component: {
				template: $('#tmpl-page-edit-edt').text(),
				data: () => {
					return this.components_bind_data['edit-edt'];
				},
				created: function () {
					// パス変数の値が必要 (this の問題) なので、意図的にアロー関数を使わない
					window.scrollTo(0, 0);
					_this.editEdtShowPage(this.$route.params.eoj, this.$route.params.epc);
				},
				watch: {
					'$route': function () {
						window.scrollTo(0, 0);
						_this.editEdtShowPage(this.$route.params.eoj, this.$route.params.epc);
					}
				},
				methods: {
					editEdt: this.editEdtExec.bind(this),
					editEdtCancel: () => {
						this.router.push({ path: '/home' });
					}
				}
			}
		},
		// リモートデバイス詳細画面
		{
			path: '/remoteDevice/:device_id/:eoj',
			component: {
				template: $('#tmpl-page-remote-device-detail').text(),
				data: () => {
					return this.components_bind_data['remote-device-detail'];
				},
				created: function () {
					// パス変数の値が必要 (this の問題) なので、意図的にアロー関数を使わない
					window.scrollTo(0, 0);
					_this.remoteDeviceDetailShowPage(this.$route.params.device_id, this.$route.params.eoj);
				},
				watch: {
					'$route': function () {
						window.scrollTo(0, 0);
						_this.remoteDeviceDetailShowPage(this.$route.params.device_id, this.$route.params.eoj);
					}
				},
				methods: {
					// リモートデバイスの EOJ のプルダウンが変更されたときの処理
					changeDeviceIdEoj: this.remoteDeviceDetailChangeDeviceIdEoj.bind(this),
					// EPC データ取得アイコンがクリックされたときの処理
					getEpcData: this.remoteDeviceDetailGetEpcData.bind(this),
					// プロパティデータ一括取得ボタンがクリックされたときの処理
					getAllEpcData: this.remoteDeviceDetailGetAllEpcData.bind(this)
				}
			}
		}
	];

	this.router = new VueRouter({
		routes: routes,
		scrollBehavior: (to, from, savedPosition) => {
			window.scrollTo(0, 0);
			return { x: 0, y: 0 };
		}
	});

	this.router.beforeEach((to, from, next) => {
		if (to.path !== '/init' && !this.app_initialized) {
			// 初期化されていなければ /init へリダイレクト
			next('/init');
		} else {
			next();
		}
	});

	this.app = new Vue({
		router: this.router,
		data: this.app_bind_data,
		methods: {
			changeLang: () => {
				let lang = this.app_bind_data['lang'];
				this.setLang(lang);
			},
			changePowerStatus: (state) => {
				this.changePowerStatus(state);
			}
		}
	}).$mount('#app');
};

// /init にアクセスがあったら、ダッシュボードを初期化
Elemu.prototype.initDashboard = function () {
	// モーダルウィンドウ表示
	this.modalLoadingShow();

	// デバイス電源状態を取得
	this._webapi.getPowerStatus().then((res) => {
		this.app_bind_data['powerStatus'] = res['data']['powerStatus'];
		// システム言語を取得
		return this._webapi.getLang();
	}).then((res) => {
		let lang = res['data']['lang'];
		// 言語設定を反映
		this.applyLang(lang);
		// リリースバージョンのリストを取得
		return this._webapi.getReleaseVersionList();
	}).then((res) => {
		this.release_list = res['data']['releaseList'];
		// DeviceDescription のデバイス一覧を取得
		return this._webapi.getDevcieDescriptionDeviceList();
	}).then((res) => {
		this.device_list = res['data']['deviceList'];
		this.components_bind_data['send-packet']['device_list'] = this.device_list;
		// エミュレート中のデバイス EOJ 情報を取得
		return this.getEojList();
	}).then((eoj_list) => {
		this._eoj_list = eoj_list;
		this._is_controller = false;
		this.components_bind_data['remote-device-list']['is_controller'] = false;
		for (let i = 0; i < this._eoj_list.length; i++) {
			let eoj = this._eoj_list[i]['eoj'];
			if (/^05FF/.test(eoj)) {
				this._is_controller = true;
				this.components_bind_data['remote-device-list']['is_controller'] = true;
			}
		}
		//エミュレート中のデバイス EOJ の EDT 情報を一括取得
		return this.getDeviceAllEdtData();
	}).then((res) => {
		this._edt_value_data = res;
		let selected_eoj = this._eoj_list[0]['eoj'];
		if (this.components_bind_data['eoj-panel']['eoj']) {
			let eoj = this.components_bind_data['eoj-panel']['eoj'];
			if (this._edt_value_data[eoj]) {
				selected_eoj = eoj;
			}
		}
		this.components_bind_data['eoj-panel']['eoj'] = selected_eoj;
		this.components_bind_data['eoj-panel']['eoj_list'] = this._eoj_list;
		this.components_bind_data['eoj-panel']['epc_list'] = this._edt_value_data[selected_eoj];
		this.components_bind_data['eoj-panel']['lang'] = this._lang;

		// リモートデバイス一覧を取得 (コントローラーの場合のみ)
		return this.getRemoteDeviceList();
	}).then((res) => {
		this.components_bind_data['remote-device-list']['remote_device_list'] = res['remoteDeviceList'];
		this.app_initialized = true;
		// モーダルウィンドウ閉じる
		this.modalLoadingClose();
		// ホーム画面へリダイレクト
		this.router.push({ path: '/home' });
	}).catch((error) => {
		console.error(error);
		// モーダルウィンドウ閉じる
		this.modalLoadingClose();
		// エラー表示
		this.modalErrorShow(error.message);
	});
};

// エミュレート中のデバイス EOJ の EDT 情報を一括取得
Elemu.prototype.getEojList = function () {
	let promise = new Promise((resolve, reject) => {
		this._webapi.getDeviceEojs().then((res) => {
			let eoj_list = res['data']['eojList'];
			let class_names = {};
			this.device_list.forEach((d) => {
				class_names[d['eoj']] = d['className'];
			});
			eoj_list.forEach((e) => {
				let class_code = e['eoj'].substr(0, 4);
				e['className'] = class_names[class_code];
			});
			resolve(eoj_list);
		}).catch((error) => {
			reject(error);
		});
	});
	return promise;
};

// エミュレート中のデバイス EOJ の EDT 情報を一括取得
/*
Elemu.prototype.getDeviceAllEdtData = function () {
	let promise = new Promise((resolve, reject) => {
		let data = {};
		let eoj_code_list = [];
		this._eoj_list.forEach((e) => {
			eoj_code_list.push(e['eoj']);
		});
		let getEpcs = (cb) => {
			let eoj_code = eoj_code_list.shift();
			if (eoj_code) {
				this._webapi.getDeviceEpcs(eoj_code).then((res) => {
					data[eoj_code] = res['data']['elProperties'];
					getEpcs(cb);
				}).catch((error) => {
					cb(error);
				});
			} else {
				cb();
			}
		};
		getEpcs((error) => {
			if (error) {
				reject(error);
			} else {
				resolve(data);
			}
		})

	});
	return promise;
};
*/
Elemu.prototype.getDeviceAllEdtData = function () {
	let promise = new Promise((resolve, reject) => {
		let data = {};
		let eoj_list = [];
		this._eoj_list.forEach((e) => {
			eoj_list.push({
				eoj: e['eoj'],
				release: e['release']
			});
		});
		let getEpcs = (cb) => {
			let eoj_data = eoj_list.shift();
			if (eoj_data) {
				let code = eoj_data['eoj'];
				//let release = eoj_data['release'];
				this._webapi.getDeviceEpcs(code).then((res) => {
					data[code] = res['data']['elProperties'];
					getEpcs(cb);
				}).catch((error) => {
					cb(error);
				});
			} else {
				cb();
			}
		};
		getEpcs((error) => {
			if (error) {
				reject(error);
			} else {
				resolve(data);
			}
		})

	});
	return promise;
};

// エミュレーターのデバイス電源状態を変更する
Elemu.prototype.changePowerStatus = function (state) {
	// モーダルウィンドウ表示
	this.modalLoadingShow();

	this._webapi.setPowerStatus({ powerStatus: state }).then((res) => {
		this.app_bind_data['powerStatus'] = res['data']['powerStatus'];
		// モーダルウィンドウ閉じる
		this.modalLoadingClose();
	}).catch((error) => {
		console.error(error);
		// モーダルウィンドウ閉じる
		this.modalLoadingClose();
		// エラー表示
		this.modalErrorShow(error.message);
	});
};

// エミュレーター側に言語を設定する
Elemu.prototype.setLang = function (lang) {
	this.modalLoadingShow();

	this._webapi.setLang({ lang: lang }).then((res) => {
		this.applyLang(res['data']['lang']);
		// モーダルウィンドウ閉じる
		this.modalLoadingClose();
	}).catch((error) => {
		console.error(error);
		// モーダルウィンドウ閉じる
		this.modalLoadingClose();
		// エラー表示
		this.modalErrorShow(error.message);
	});
};

// 言語設定を反映
Elemu.prototype.applyLang = function (lang) {
	if (!lang || !/^(ja|en)$/.test(lang)) {
		lang = 'ja';
	}
	this._lang = lang;
	this.app_bind_data['lang'] = this._lang;
	this.components_bind_data['home'].lang = this._lang;
	this.components_bind_data['send-packet'].lang = this._lang;
	this.components_bind_data['packet-monitor'].lang = this._lang;
	this.components_bind_data['packet-detail'].lang = this._lang;
	this.components_bind_data['conf'].lang = this._lang;
	this.components_bind_data['eoj-panel'].lang = this._lang;
	this.components_bind_data['add-eoj'].lang = this._lang;
	this.components_bind_data['edit-eoj'].lang = this._lang;
	this.components_bind_data['edit-edt'].lang = this._lang;
	this.components_bind_data['remote-device-list'].lang = this._lang;
	this.components_bind_data['remote-device-detail'].lang = this._lang;
};

// WebSocket チャネルを準備
Elemu.prototype.initWs = function () {
	let ws = new WebSocket('ws://' + document.location.host);
	ws.onopen = () => {
		this.app_bind_data['wsStatus'] = true;
		console.log('WebSocket コネクションを確立しました。');
	};
	ws.onmessage = (event) => {
		let o = JSON.parse(event.data);
		if (o['event'] === 'packetreceived' || o['event'] === 'packetsent') {
			// パケット送受信イベント
			this.packetMonitorShowPacketInList(o);
			// パケット送信の IP アドレス候補を更新
			let addr = o['data']['address'];
			let alist = this.components_bind_data['send-packet']['address_candidate_list'];
			if (alist.indexOf(addr) < 0) {
				alist.push(addr);
			}
		} else if (o['event'] === 'powerstatuschanged') {
			// 電源ステータス変化イベント
			this.app_bind_data['powerStatus'] = o['data']['powerStatus'];
		} else if (o['event'] === 'discovered') {
			// リモートデバイス発見イベント
			this.components_bind_data['remote-device-list']['remote_device_list'].push(o['data']);
			let did = o['data']['id'];
			this.remote_devices[did] = o['data'];
		} else if (o['event'] === 'disappeared') {
			// リモートデバイスロストイベント
			let did = o['data']['id'];
			let new_list = [];
			this.components_bind_data['remote-device-list']['remote_device_list'].forEach((d) => {
				if (d['id'] !== did) {
					new_list.push(d);
				}
			});
			this.components_bind_data['remote-device-list']['remote_device_list'] = new_list;
			if (this.remote_devices[did]) {
				delete this.remote_devices[did];
			}
		} else if (o['event'] === 'remoteepcupdated') {
			// リモートデバイス EPC データ更新イベント
			let bind_data = this.components_bind_data['remote-device-detail'];
			if (bind_data['address'] === o['data']['address'] && bind_data['eoj'] === o['data']['eoj']) {
				o['data']['elProperties'].forEach((e) => {
					let epc = e['epc'];
					let edt_data = e['edt'];
					for (let i = 0; i < bind_data['epc_list'].length; i++) {
						let binded_epc_data = bind_data['epc_list'][i];
						if (binded_epc_data['epc'] === epc) {
							binded_epc_data['edt'] = edt_data;
						}
					}
				});
			}
		} else {
			//console.log(JSON.stringify(o, null, '  '));
		}
	};
	ws.onerror = () => {
		this.app_bind_data['wsStatus'] = false;
		console.log('WebSocket コネクション確立に失敗しました。')
	};
	ws.onclose = (event) => {
		this.app_bind_data['wsStatus'] = false;
		console.log('WebSocket コネクションが切断されました: ' + event.code + " " + event.reason);
		if (event.wasClean === false) {
			console.log('意図せぬ切断が発生しました。');
			window.setTimeout(() => {
				this.initWs();
			}, 1000);
		}
	};
};


/* --------------------------------------------------------------
* ホーム画面のパケットモニターの関連メソッド
* ------------------------------------------------------------ */

// パケットの一覧表示
//  WebSocket のイベントにより呼び出される
Elemu.prototype.packetMonitorShowPacketInList = function (o) {
	// モニター停止フラグをチェック
	const bind_data = this.components_bind_data['packet-monitor'];
	if(bind_data['paused'] === true) {
		return;
	}

	// パケット送受信イベント
	if (o['data']['packet']['result'] !== 0) {
		return;
	}
	let packet_id = 'packet-' + this.packet_no;
	let data = o['data'];
	this.packets[packet_id] = data;
	let pkt = {
		no: this.packet_no,
		id: packet_id,
		direction: data['direction'],
		address: data['address'],
		hex: data['packet']['data']['hex']
	};

	let to_be_filtered = false;

	if(bind_data['filter1'] === true) {
		const esv = data['packet']['data']['data']['esv']['hex'];
		const dir = data['direction'];

		if((esv === '62' && dir === 'RX') || (esv === '72' && dir === 'TX')) {
			to_be_filtered = true;
		}
	}

	if(to_be_filtered === false) {
		bind_data['packet_list'].push(pkt);
		if ($('#packet-list-wrapper')[0]) {
			$('#packet-list-wrapper')[0].scrollTop = $('#packet-list-wrapper')[0].scrollHeight;
		}
	}

	this.packet_no++;
};

// パケットの詳細を表示
//   パケット一覧がクリックされたときに呼び出される
Elemu.prototype.packetMonitorShowPacketDetail = function (event) {
	if (this.active_packet_id) {
		$('#' + this.active_packet_id).removeClass('active');
		this.active_packet_id = '';
	}
	let t = event.target;
	$('#' + t.id).addClass('active');
	let p = this.packets[t.id];
	let bd = this.components_bind_data['packet-detail'];
	bd['hidden'] = false;
	bd['lang'] = this.app_bind_data['lang'];
	bd['direction'] = p['direction'];
	bd['address'] = p['address'];
	bd['hex'] = p['packet']['data']['hex'];
	bd['data'] = p['packet']['data']['data'];
	this.active_packet_id = t.id;
};

// パケット一覧から矢印キーが押されたときの処理
Elemu.prototype.packetMonitorUpDownList = function (event) {
	event.preventDefault();
	event.stopPropagation();
	// 選択中のパケット行がなければ終了
	if (!this.active_packet_id) {
		return;
	}
	// 現在選択中のパケット ID
	let id_parts = this.active_packet_id.split('-');
	let pno = parseInt(id_parts[1], 10);

	let c = event.keyCode;
	let k = event.key;
	if (c === 38 || k === 'ArrowUp') {
		// 上矢印キー
		pno--;
	} else if (c === 40 || k === 'ArrowDown') {
		// 下矢印キー
		pno++;
	} else {
		return;
	}

	// 希望のパケット行があるかどうかをチェック
	let p = this.packets['packet-' + pno];
	if (!p) {
		return;
	}

	// 遷移したいパケット行にフォーカスする
	$('#packet-' + pno).focus();
};

// パケット一覧クリア
Elemu.prototype.packetMonitorClearPacketList = function (event) {
	this.components_bind_data['packet-monitor']['packet_list'] = [];
	this.components_bind_data['packet-detail']['hidden'] = true;
	this.packets = {};
	this.active_packet_id = '';
};

// モニター停止・再開モニター停止・再開
Elemu.prototype.packetMonitorTogglePlayPause = function (event) {
	const bind_data = this.components_bind_data['packet-monitor'];
	const paused = bind_data['paused'];
	bind_data['paused'] = !paused;
};


/* --------------------------------------------------------------
* ホーム画面のデバイスオブジェクトインスタンスの関連メソッド
* ------------------------------------------------------------ */

// ホーム画面:デバイスオブジェクトインスタンス:EOJリストを更新
Elemu.prototype.eojPanelUpdateEoj = function (event) {
	let selected_eoj = this.components_bind_data['eoj-panel']['eoj'];
	this.components_bind_data['eoj-panel']['epc_list'] = this._edt_value_data[selected_eoj];
};

// EOJ 削除
Elemu.prototype.eojPanelDeleteEoj = function (event) {
	// 選択されている EOJ を特定
	let eoj = this.components_bind_data['eoj-panel']['eoj'];
	// 選択されている EOJ のクラス名を特定
	let eoj_list = this.components_bind_data['eoj-panel']['eoj_list'];
	let class_name = {};
	for (let i = 0; i < eoj_list.length; i++) {
		let eoj_data = eoj_list[i];
		if (eoj_list[i]['eoj'] === eoj) {
			class_name = eoj_list[i]['className'];
			break;
		}
	}
	// 確認ダイアログを表示
	let msg = '';
	if (this._lang === 'ja') {
		msg = '"0x' + eoj + ' ' + class_name['ja'] + '" を削除してもよろしいですか？';
	} else {
		msg = 'Do you delete "0x' + eoj + ' ' + class_name['en'] + '"?';
	}
	let cres = window.confirm(msg);
	if (cres === false) {
		return;
	}

	// モーダルウィンドウ表示
	this.modalLoadingShow();

	// EOJ 削除処理
	this._webapi.deleteDeviceEoj(eoj).then((res) => {
		// モーダルウィンドウ閉じる
		this.modalLoadingClose();
		// ダッシュボードを初期化
		this.initDashboard();
	}).catch((error) => {
		console.error(error);
		// モーダルウィンドウ閉じる
		this.modalLoadingClose();
		// エラー表示
		this.modalErrorShow(error.message);
	});
};

// EDT 再読込
Elemu.prototype.eojPanelReloadEdt = function (event) {
	// モーダルウィンドウ表示
	this.modalLoadingShow();
	//エミュレート中のデバイス EOJ の EDT 情報を一括取得
	this.getDeviceAllEdtData().then((res) => {
		this._edt_value_data = res;
		let bind_data = this.components_bind_data['eoj-panel'];
		let selected_eoj = bind_data['eoj'];
		bind_data['epc_list'] = this._edt_value_data[selected_eoj];
		// モーダルウィンドウ閉じる
		this.modalLoadingClose();
	}).catch((error) => {
		console.error(error);
		// モーダルウィンドウ閉じる
		this.modalLoadingClose();
		// エラー表示
		this.modalErrorShow(error.message);
	})
};


/* --------------------------------------------------------------
* ホーム画面のリモートデバイス一覧の関連メソッド
* ------------------------------------------------------------ */

// 発見パケット送信ボタンが押されたときの処理
Elemu.prototype.remoteDeviceListSendDiscoveryPacket = function (event) {
	// モーダルウィンドウ表示
	this.modalLoadingShow();
	// 発見パケット送信
	this._webapi.sendDiscoveryPacket().then((res) => {
		// モーダルウィンドウ閉じる
		this.modalLoadingClose();
	}).catch((error) => {
		console.error(error);
		// モーダルウィンドウ閉じる
		this.modalLoadingClose();
		// エラー表示
		this.modalErrorShow(error.message);
	});
};

// リモートデバイスをクリア
Elemu.prototype.remoteDeviceListDelete = function (event) {
	// モーダルウィンドウ表示
	this.modalLoadingShow();
	// リモートデバイス削除
	this._webapi.deleteRemoteDevices().then((res) => {
		// モーダルウィンドウ閉じる
		this.modalLoadingClose();
	}).catch((error) => {
		console.error(error);
		// モーダルウィンドウ閉じる
		this.modalLoadingClose();
		// エラー表示
		this.modalErrorShow(error.message);
	});
};

// 再読込ボタンが押されたときの処理 (リモートデバイス一覧取得表示)
Elemu.prototype.remoteDeviceListReload = function (event) {
	// モーダルウィンドウ表示
	this.modalLoadingShow();
	// リモートデバイスリストを取得
	this.getRemoteDeviceList().then((res) => {
		// モーダルウィンドウ閉じる
		this.modalLoadingClose();
		// データバインド
		this.components_bind_data['remote-device-list']['remote_device_list'] = res['remoteDeviceList'];
	}).catch((error) => {
		console.error(error);
		// モーダルウィンドウ閉じる
		this.modalLoadingClose();
		// エラー表示
		this.modalErrorShow(error.message);
	});
};

Elemu.prototype.getRemoteDeviceList = function () {
	let promise = new Promise((resolve, reject) => {
		if (this._is_controller === false) {
			resolve({
				remoteDeviceList: []
			});
			return;
		}
		this._webapi.getRemoteDeviceList().then((res) => {
			resolve({
				remoteDeviceList: res['data']['remoteDeviceList']
			});
		}).catch((error) => {
			reject(error);
		})
	});
	return promise;
};

/* --------------------------------------------------------------
* ホーム画面のパケット送信の関連メソッド
* ------------------------------------------------------------ */

// ホーム画面:パケット送信:EPCリストを更新
//   SEOJ, DEOJ, ESV に変更があった時に呼び出される
Elemu.prototype.sendPacketUpdateEpcList = function (event) {
	let bind_data = this.components_bind_data['send-packet'];
	let packet = bind_data['packet'];
	let scode = packet['seoj']['class_code'];
	let dcode = packet['deoj']['class_code'];
	let esv = packet['esv'];

	if(esv === '62') {
		bind_data['edt_disabled'] = true;
	} else {
		bind_data['edt_disabled'] = false;
	}

	let epc_num_max = 10;

	if (!scode || !dcode || !esv) {
		bind_data['epc_list'] = [];
		for (let i = 1; i <= epc_num_max; i++) {
			packet['epc_' + i] = '';
			packet['edt_' + i] = '';
		}
		return;
	}

	let current_class_code = bind_data['class_code'];
	let selected_class_code = '';
	if (/^6/.test(esv)) {
		selected_class_code = dcode;
	} else if (/^(7|5)/.test(esv)) {
		selected_class_code = scode;
	} else {
		return;
	}

	if (selected_class_code === current_class_code) {
		return;
	}

	bind_data['epc_list'] = [];
	for (let i = 1; i <= epc_num_max; i++) {
		packet['epc_' + i] = '';
		packet['edt_' + i] = '';
	}

	bind_data['class_code'] = selected_class_code;

	if (selected_class_code in this.device_details) {
		bind_data['epc_list'] = this.device_details[selected_class_code]['elProperties'];
		bind_data['class_name'] = this.device_details[selected_class_code]['className'];
		return;
	}

	// モーダルウィンドウ表示
	this.modalLoadingShow();

	this._webapi.getDevcieDescriptionDevice(selected_class_code).then((res) => {
		let d = res['data']['device'];
		this.device_details[selected_class_code] = d;
		bind_data['epc_list'] = d['elProperties'];
		bind_data['class_name'] = d['className'];
		// モーダルウィンドウ閉じる
		this.modalLoadingClose();
	}).catch((error) => {
		console.error(error);
		// モーダルウィンドウ閉じる
		this.modalLoadingClose();
		// エラー表示
		this.modalErrorShow(error.message);
	});
};

// ホーム画面:パケット送信
Elemu.prototype.sendPacketExec = function (event) {
	let bd_packet = this.components_bind_data['send-packet']['packet'];

	// IP アドレス
	let address = bd_packet['address'];
	if (!address) {
		// エラー表示
		this.modalErrorShow({
			ja: 'IP アドレスは必須です。',
			en: 'IP address is required.'
		});
		return;
	}

	// SEOJ
	let scode = bd_packet['seoj']['class_code'];
	let sins = bd_packet['seoj']['instance'];
	let seoj = scode + sins;

	// DEOJ
	let dcode = bd_packet['deoj']['class_code'];
	let dins = bd_packet['deoj']['instance'];
	let deoj = dcode + dins;

	// ESV
	let esv = bd_packet['esv'];

	// OPC
	let opc = bd_packet['opc'];
	if (!opc) {
		// エラー表示
		this.modalErrorShow({
			ja: 'OPC は必須です。',
			en: 'OPC is required.'
		});
		return;
	}

	// Properties
	let opc_value = parseInt(opc, 16);
	let prop_list = [];
	if (opc_value > 0) {
		let error = null;
		for (let i = 1; i <= opc_value; i++) {
			let epc = bd_packet['epc_' + i];
			let edt = bd_packet['edt_' + i];
			if (!epc) {
				error = new Error('EPC-' + i + ' is required.');
				break;
			}
			if(esv === '62') {
				edt = '';
			}
			prop_list.push({
				epc: epc,
				edt: edt
			});
		}
		if (error) {
			console.error(error);
			return;
		}
	}

	// パケット生成
	let p = {
		address: address,
		packet: {
			tid: bd_packet['tid'] || undefined,
			seoj: seoj,
			deoj: deoj,
			esv: esv,
			opc: opc,
			properties: prop_list
		}
	};

	// モーダルウィンドウ表示
	this.modalLoadingShow();

	// パケット送信
	this._webapi.sendPacket(p).then((res) => {
		// モーダルウィンドウ閉じる
		this.modalLoadingClose();
	}).catch((error) => {
		console.error(error);
		// モーダルウィンドウ閉じる
		this.modalLoadingClose();
		// エラー表示
		this.modalErrorShow(error.message);
	});
};

// ホーム画面:パケット送信:EDT詳細モーダル表示
Elemu.prototype.sendPacketShowEdtDetailModal = function (event) {
	let number = event.currentTarget.getAttribute('data-number');
	let epc = this.components_bind_data['send-packet']['packet']['epc_' + number];

	let ccode = this.components_bind_data['send-packet']['class_code'];
	let cname_data = this.components_bind_data['send-packet']['class_name'];
	let cname = (this._lang === 'ja') ? cname_data['ja'] : cname_data['en'];

	let dev = this.device_details[ccode];

	let epc_data = null;
	for (let i = 0; i < dev['elProperties'].length; i++) {
		if (dev['elProperties'][i]['epc'] === epc) {
			epc_data = dev['elProperties'][i];
			break;
		}
	}
	let pname_data = epc_data['propertyName'];
	let pname = (this._lang === 'ja') ? pname_data['ja'] : pname_data['en'];

	let body = JSON.stringify(epc_data, null, '  ');

	//$('#modal-info-title').text('0x' + ccode + ' ' + cname + ' > 0x' + epc + ' ' + pname);
	//$('#modal-info-message').html('<pre>' + body + '</pre>');
	//$('#modal-info').modal('show');

	window.localStorage.setItem('edt-detail-title', '0x' + ccode + ' ' + cname + ' > 0x' + epc + ' ' + pname);
	window.localStorage.setItem('edt-detail-json', body);
	window.open('edtDetail.html', 'edtDetail', 'width=600,height=700');
};

/* --------------------------------------------------------------
* 設定画面の関連メソッド
* ------------------------------------------------------------ */

// 設定画面表示
Elemu.prototype.confShowPage = function () {
	this.components_bind_data['conf']['lang'] = this._lang;
	// モーダルウィンドウ表示
	this.modalLoadingShow();
	// 表示データクリア
	this.components_bind_data['conf']['data'] = {};
	// 設定データ取得
	this._webapi.getSystemConfigurations().then((res) => {
		// 表示データセット
		this.components_bind_data['conf']['data'] = res['data'];
		// モーダルウィンドウ閉じる
		this.modalLoadingClose();
	}).catch((error) => {
		console.error(error);
		// モーダルウィンドウ閉じる
		this.modalLoadingClose();
		// エラー表示
		this.modalErrorShow(error.message);
	});
};

// システム設定情報保存
Elemu.prototype.confSubmitConfig = function () {
	// フォームバリデーション
	try {
		let form_el = document.getElementById('sys-conf-frm');
		let form_valid = form_el.checkValidity();
		if (!form_valid) {
			form_el.reportValidity();
			return;
		}
	} catch (e) { }

	// モーダルウィンドウ表示
	this.modalLoadingShow();

	// 設定データ収集
	let d = this.components_bind_data['conf']['data'];
	let conf = {
		"ip_address_version": parseInt(d['ip_address_version'], 10),
		"packet_log": d['packet_log'],
		"packet_log_days": parseInt(d['packet_log_days'], 10),
		"multicast_response_wait_min_msec": parseInt(d['multicast_response_wait_min_msec'], 10),
		"multicast_response_wait_max_msec": parseInt(d['multicast_response_wait_max_msec'], 10),
		"get_res_wait_msec": parseInt(d['get_res_wait_msec'], 10),
		"set_res_wait_msec": parseInt(d['set_res_wait_msec'], 10),
		"inf_res_wait_msec": parseInt(d['inf_res_wait_msec'], 10),
		"epc_data_setting_time_msec": parseInt(d['epc_data_setting_time_msec'], 10),
		"instance_announce_interval_sec": parseInt(d['instance_announce_interval_sec'], 10),
		"property_announce_interval_sec": parseInt(d['property_announce_interval_sec'], 10),
		"request_timeout_msec": parseInt(d['request_timeout_msec'], 10),
		"request_interval_msec": parseInt(d['request_interval_msec'], 10),
		"request_retry_limit": parseInt(d['request_retry_limit'], 10)
	};

	// 設定保存
	this._webapi.setSystemConfigurations(conf).then((res) => {
		// モーダルウィンドウ閉じる
		this.modalLoadingClose();
		// 初期化画面へリダイレクト
		this.router.push({ path: '/init' });
	}).catch((error) => {
		console.error(error);
		// モーダルウィンドウ閉じる
		this.modalLoadingClose();
		// エラー表示
		this.modalErrorShow(error.message);
	});
};

Elemu.prototype.confResetSystem = function () {
	let message = 'Do you really want to reset this system?';
	if (this._lang === 'ja') {
		message = '本当にリセットしてもよろしいですか？';
	}
	let ok = window.confirm(message);
	if (!ok) {
		return;
	}
	// モーダルウィンドウ表示
	this.modalLoadingShow();
	// リセット
	this._webapi.resetSystem().then((res) => {
		// モーダルウィンドウ閉じる
		this.modalLoadingClose();
		// 初期化画面へリダイレクト
		this.router.push({ path: '/init' });
	}).catch((error) => {
		console.error(error);
		// モーダルウィンドウ閉じる
		this.modalLoadingClose();
		// エラー表示
		this.modalErrorShow(error.message);
	});
};

/* --------------------------------------------------------------
* EOJ 新規登録画面の関連メソッド
* ------------------------------------------------------------ */

// EOJ 新規登録画面表示
Elemu.prototype.addEojShowPage = function () {
	let bind = this.components_bind_data['add-eoj'];
	bind['eoj_list'] = this.device_list;
	bind['lang'] = this._lang;
	bind['instance'] = '1';
	bind['release_list'] = this.release_list;
	bind['release'] = this.release_list[this.release_list.length - 1];
};

// EOJ 新規登録処理
Elemu.prototype.addEojExec = function () {
	// 入力値チェック
	let bind = this.components_bind_data['add-eoj'];
	let eoj = bind['eoj'];
	let instance = bind['instance'];
	let release = bind['release'];

	let dev = null;

	if (!eoj) {
		this.modalErrorShow({
			ja: 'デバイスクラスを選択してください。',
			en: 'Select a device class.'
		});
		return;
	} else if (!/^[0-9A-F]{4}$/.test(eoj)) {
		this.modalErrorShow({
			ja: 'デバイスクラスの値が不正です。',
			en: 'The value of the device class is invalid.'
		});
		return;
	} else {
		for (let i = 0; i < this.device_list.length; i++) {
			if (this.device_list[i]['eoj'] === eoj) {
				dev = this.device_list[i];
				break;
			}
		}
		if (!dev) {
			this.modalErrorShow({
				ja: 'デバイスクラスの値が不正です。',
				en: 'The value of the device class is invalid.'
			});
			return;
		}
	}

	let instance_hex = '';
	if (!instance) {
		this.modalErrorShow({
			ja: 'インスタンス番号を選択してください。',
			en: 'Select an instance number.'
		});
		return;
	//} else if (!/^0[1-9]$/.test(instance)) {
	} else if (!/^\d{1,3}$/.test(instance)) {
		this.modalErrorShow({
			ja: 'インスタンス番号の値が不正です。',
			en: 'The value of the instance number is invalid.'
		});
		return;
	} else {
		let instance_num = parseInt(instance, 10);
		if (instance_num < 1 || instance_num > 255) {
			this.modalErrorShow({
				ja: 'インスタンス番号は 1 ～ 255 の整数でなければいけません。',
				en: 'The value of the instance number must be an integer between 1 and 255.'
			});
			return;
		}
		instance_hex = ('0' + instance_num.toString(16)).slice(-2);
	}


	if (!release) {
		this.modalErrorShow({
			ja: 'リリース番号を選択してください。',
			en: 'Select a release number.'
		});
		return;
	} else if (!/^[A-Z]$/.test(release)) {
		this.modalErrorShow({
			ja: 'リリース番号の値が不正です。',
			en: 'The value of the release number is invalid.'
		});
		return;
	} else if (release < dev['firstRelease']) {
		this.modalErrorShow({
			ja: '指定のデバイスクラスは、指定のリリース番号をサポートしていません。',
			en: 'The specified device class does not support the specified release version.'
		});
		return;
	}

	// モーダルウィンドウ表示
	this.modalLoadingShow();

	// EOJ 登録処理
	this._webapi.addDeviceEoj(eoj + instance_hex, release).then((res) => {
		this.components_bind_data['eoj-panel']['eoj'] = eoj + instance_hex;
		// モーダルウィンドウ閉じる
		this.modalLoadingClose();
		// ダッシュボードを初期化
		this.initDashboard();
	}).catch((error) => {
		console.error(error);
		// モーダルウィンドウ閉じる
		this.modalLoadingClose();
		// エラー表示
		this.modalErrorShow(error.message);
	});
};


/* --------------------------------------------------------------
* EOJ 編集画面の関連メソッド
* ------------------------------------------------------------ */

// EOJ 編集画面表示
Elemu.prototype.editEojShowPage = function (eoj) {
	// 登録済みの EOJ かどうかをチェック
	let current_eoj_data = null;
	for (let i = 0; i < this._eoj_list.length; i++) {
		if (this._eoj_list[i]['eoj'] === eoj) {
			current_eoj_data = this._eoj_list[i];
			break;
		}
	}
	if (!current_eoj_data) {
		this.modalErrorShow({
			ja: 'EOJ の値が不正です。',
			en: 'The value of the EOJ is invalid.'
		});
		return;
	}
	// 該当のデバイスクラス情報を取得
	let dev = null;
	let class_code = eoj.substr(0, 4);
	for (let i = 0; i < this.device_list.length; i++) {
		if (this.device_list[i]['eoj'] === class_code) {
			dev = this.device_list[i];
			break;
		}
	}

	// 選択可能なリリースバージョンを特定
	let release_list = [];
	this.release_list.forEach((r) => {
		if (r >= dev['firstRelease']) {
			release_list.push(r);
		}
	});
	// バインドデータ
	let bind_data = this.components_bind_data['edit-eoj'];
	bind_data['eoj'] = eoj;
	bind_data['lang'] = this._lang;
	bind_data['release_list'] = release_list;
	bind_data['release'] = current_eoj_data['release'];

	// DeviceDescription 取得
	this.modalLoadingShow();
	let release = current_eoj_data['release'];
	this._webapi.getDevcieDescriptionDevice(class_code, release).then((res) => {
		let d = res['data']['device'];
		this.device_details[class_code] = d;
		this.prepareAllEpcList(bind_data['release'], d['elProperties']);
		bind_data['class_name'] = d['className'];
		bind_data['supported_epc_list'] = current_eoj_data['epc'];
		this.modalLoadingClose();
	}).catch((error) => {
		console.error(error);
		this.modalLoadingClose();
		this.modalErrorShow(error.message);
	});
};

Elemu.prototype.prepareAllEpcList = function (release, prop_list) {
	let plist = JSON.parse(JSON.stringify(prop_list));
	plist.forEach((d) => {
		// 必須の EPC かどうか
		let ar = d['accessRule'];
		if (ar && ar['get'] === 'required' || ar['set'] === 'required' || ar['inf'] === 'required') {
			d['required'] = true;
		} else {
			d['required'] = false;
		}
		// リリースバージョンをチェック
		d['disabled'] = false;
		let vr = d['validRelease'];
		if (vr) {
			if (release < vr['from']) {
				d['disabled'] = true;
			}
			if (vr['to'] !== 'latest') {
				if (release > vr['to']) {
					d['disabled'] = true;
				}
			}
		}
	});
	let bind_data = this.components_bind_data['edit-eoj'];
	bind_data['all_epc_list'] = plist;
};

// リリースバージョンが変更されたときの処理
Elemu.prototype.editEojReleaseChanged = function () {
	let bind_data = this.components_bind_data['edit-eoj'];
	// 該当のデバイスクラス情報を取得
	let eoj = bind_data['eoj'];
	let class_code = eoj.substr(0, 4);
	let d = this.device_details[class_code];
	// バインドデータ更新
	this.prepareAllEpcList(bind_data['release'], d['elProperties']);
};

// EOJ 編集処理
Elemu.prototype.editEojExec = function () {
	let bind_data = this.components_bind_data['edit-eoj'];
	let eoj = bind_data['eoj'];
	let release = bind_data['release'];
	let eoj_list = bind_data['supported_epc_list'];

	// モーダルウィンドウ表示
	this.modalLoadingShow();

	// EOJ 更新処理
	this._webapi.updateDeviceEoj(eoj, release, eoj_list).then((res) => {
		// モーダルウィンドウ閉じる
		this.modalLoadingClose();
		// ダッシュボードを初期化
		this.initDashboard();
	}).catch((error) => {
		console.error(error);
		// モーダルウィンドウ閉じる
		this.modalLoadingClose();
		// エラー表示
		this.modalErrorShow(error.message);
	});
};

/* --------------------------------------------------------------
* EDT 編集画面の関連メソッド
* ------------------------------------------------------------ */

Elemu.prototype.editEdtShowPage = function (eoj, epc) {
	let bind_data = this.components_bind_data['edit-edt'];
	bind_data['lang'] = this._lang;
	bind_data['eoj'] = eoj;
	bind_data['epc'] = epc;

	// 選択中の EOJ 情報
	let eoj_data = null;
	for (let i = 0; i < this._eoj_list.length; i++) {
		if (this._eoj_list[i]['eoj'] === eoj) {
			eoj_data = this._eoj_list[i];
			break;
		}
	}
	bind_data['release'] = eoj_data['release'];
	bind_data['class_name'] = eoj_data['className'];

	// 指定の EPC が有効なモノかをチェック
	if (eoj_data['epc'].indexOf(epc) < 0) {
		this.modalErrorShow({
			ja: '指定の EPC が不正です。',
			en: 'The specified EPC is invalid.'
		});
		return;
	}

	// 該当のデバイスクラス情報を取得
	let class_code = eoj.substr(0, 4);
	let d = this.device_details[class_code];
	if (!d) {
		// DeviceDescription 取得
		this.modalLoadingShow();
		let release = eoj_data['release'];
		this._webapi.getDevcieDescriptionDevice(class_code, release).then((res) => {
			this.device_details[class_code] = res['data']['device'];
			this.modalLoadingClose();
			this.editEdtShowPage(eoj, epc);
		}).catch((error) => {
			console.error(error);
			this.modalLoadingClose();
			this.modalErrorShow(error.message);
		});
		return;
	}

	// EPC 情報を特定
	let epc_data = null;
	for (let i = 0; i < d['elProperties'].length; i++) {
		if (d['elProperties'][i]['epc'] === epc) {
			epc_data = d['elProperties'][i];
			break;
		}
	}
	bind_data['property_name'] = epc_data['propertyName'];
	bind_data['description'] = epc_data['data'];
	let edt_desc = epc_data['data'];
	bind_data['description_json'] = JSON.stringify(edt_desc, null, '  ');
	bind_data['note'] = epc_data['note'];

	// 現在の EDT 情報
	let edt_data_list = this._edt_value_data[eoj];
	let edt_data = null;
	for (let i = 0; i < edt_data_list.length; i++) {
		if (edt_data_list[i]['epc'] === epc) {
			edt_data = edt_data_list[i]['edt'];
			break;
		}
	}

	bind_data['edt'] = edt_data;

	// 新しい EDT 入力フォーム
	bind_data['inputs'] = {};
	let type = edt_desc['type'];
	if (type === 'state') {
		let current_hex = '';
		for (let i = 0; i < edt_desc['enum'].length; i++) {
			if (edt_desc['enum'][i]['edt'] === '0x' + edt_data['hex']) {
				current_hex = edt_desc['enum'][i]['edt'];
				break;
			}
		}
		bind_data['inputs']['state'] = current_hex;
	} else if (type === 'number') {
		bind_data['inputs']['number'] = edt_data['data']['number']['value'];
	} else if (type === 'time') {
		bind_data['inputs']['time'] = edt_data['data']['time'];
	} else if (type === 'date-time') {
		bind_data['inputs']['dateTime'] = edt_data['data']['dateTime'];
	} else {
		bind_data['inputs']['hex'] = edt_data['hex'];
	}

};

Elemu.prototype.editEdtExec = function () {
	let bind_data = this.components_bind_data['edit-edt'];
	let eoj = bind_data['eoj'];
	let epc = bind_data['epc'];
	let inputs = bind_data['inputs'];

	// 該当のデバイスクラス情報を取得
	let class_code = eoj.substr(0, 4);
	let d = this.device_details[class_code];

	// EPC 情報を特定
	let epc_data = null;
	for (let i = 0; i < d['elProperties'].length; i++) {
		if (d['elProperties'][i]['epc'] === epc) {
			epc_data = d['elProperties'][i];
			break;
		}
	}
	let edt_desc = epc_data['data'];
	let edt_hex = '';
	let type = edt_desc['type'];

	if (type === 'state') {
		edt_hex = inputs['state'].replace(/^0x/, '');
	} else if (type === 'number') {
		let value = parseFloat(inputs['number']);
		if (edt_desc['multiple']) {
			value = value / edt_desc['multiple'];
		}
		value = parseInt(value, 10);
		let format = edt_desc['format'];
		let data_view = null;
		if (format === 'int8') {
			let buf = new ArrayBuffer(1);
			data_view = new DataView(buf);
			data_view.setInt8(0, value);
		} else if (format === 'int16') {
			let buf = new ArrayBuffer(2);
			data_view = new DataView(buf);
			data_view.setInt16(0, value, false);
		} else if (format === 'int32') {
			let buf = new ArrayBuffer(4);
			data_view = new DataView(buf);
			data_view.setInt32(0, value, false);
		} else if (format === 'uint8') {
			let buf = new ArrayBuffer(1);
			data_view = new DataView(buf);
			data_view.setUint8(0, value);
		} else if (format === 'uint16') {
			let buf = new ArrayBuffer(2);
			data_view = new DataView(buf);
			data_view.setUint16(0, value, false);
		} else if (format === 'uint32') {
			let buf = new ArrayBuffer(4);
			data_view = new DataView(buf);
			data_view.setUint32(0, value, false);
		} else {
			this.modalErrorShow({
				ja: 'Device Description に既知の format が見つかりませんでした。',
				en: 'No known format was found in the Device Description.'
			});
			return;
		}
		for (let i = 0; i < data_view.byteLength; i++) {
			let v = data_view.getUint8(i);
			let hex = v.toString(16);
			hex = ('0' + hex).slice(-2);
			edt_hex += hex;
		}

	} else if (type === 'time') {
		let size = edt_desc['size'];
		let value = inputs['time'];
		if (/[^0-9\:]/.test(value)) {
			this.modalErrorShow({
				ja: '値を時刻として読み取れませんでした。',
				en: 'The value was not parsed as a time.'
			});
			return;
		}

		let list = value.split(':');
		for (let i = 0; i < size; i++) {
			let v = list.shift();
			if (!v) {
				v = '00';
			}
			v = parseInt(v, 10);
			v = ('0' + v.toString(16)).slice(-2);
			edt_hex += v;
		}
	} else if (type === 'date-time') {
		let size = edt_desc['size'];
		let value = inputs['dateTime'];
		if (/[^0-9\-\:T]/.test(value)) {
			this.modalErrorShow({
				ja: '値を日時として読み取れませんでした。',
				en: 'The value was not parsed as a date-time.'
			});
			return;
		}
		let parts = value.split('T');
		let date = parts[0];
		let time = parts[1];

		let date_parts = date.split('-');

		let time_parts = [];
		if (time && size >= 5) {
			time_parts = time.split(':');
		}

		let Y = parseInt(date_parts[0], 10);
		edt_hex += ('000' + Y.toString(16)).slice(-4);

		if (size >= 3) {
			let M = parseInt(date_parts[1], 10);
			edt_hex += ('0' + M.toString(16)).slice(-2);
		}
		if (size >= 4) {
			let D = parseInt(date_parts[2], 10);
			edt_hex += ('0' + D.toString(16)).slice(-2);
		}
		if (size >= 5) {
			let h = parseInt(time_parts[0], 10);
			edt_hex += ('0' + h.toString(16)).slice(-2);
		}
		if (size >= 6) {
			let m = parseInt(time_parts[1], 10);
			edt_hex += ('0' + m.toString(16)).slice(-2);
		}
		if (size >= 7) {
			let s = parseInt(time_parts[2], 10);
			edt_hex += ('0' + s.toString(16)).slice(-2);
		}
	} else {
		edt_hex = inputs['hex'];
	}
	edt_hex = edt_hex.toLocaleUpperCase();


	this.modalLoadingShow();
	this._webapi.updateDeviceEdt(eoj, epc, edt_hex).then((res) => {
		this.modalLoadingClose();
		this.router.push({ path: '/home' });
		this.eojPanelReloadEdt();
	}).catch((error) => {
		console.error(error);
		this.modalLoadingClose();
		this.modalErrorShow(error.message);
	});
};

/* --------------------------------------------------------------
* リモートデバイス詳細の関連メソッド
* ------------------------------------------------------------ */

// 画面表示
Elemu.prototype.remoteDeviceDetailShowPage = function (device_id, eoj) {
	// モーダルウィンドウ表示
	this.modalLoadingShow();
	// リモートデバイスリストを取得
	this.getRemoteDeviceList().then((res) => {
		// モーダルウィンドウ閉じる
		this.modalLoadingClose();
		// データバインド
		let bind_data = this.components_bind_data['remote-device-detail'];
		bind_data['remote_device_list'] = res['remoteDeviceList'];
		bind_data['remote_device_list'] = res['remoteDeviceList'];
		bind_data['device_id_eoj'] = device_id + '-' + eoj;
		bind_data['device_id'] = device_id;
		bind_data['eoj'] = eoj;

		bind_data['epc_list'] = [];
		for (let i = 0; i < res['remoteDeviceList'].length; i++) {
			let rd = res['remoteDeviceList'][i];
			let hit = false;
			if (rd['id'] === device_id) {
				bind_data['address'] = rd['address'];
				for (let j = 0; j < rd['eojList'].length; j++) {
					let ed = rd['eojList'][j];
					if (ed['eoj'] === eoj) {
						bind_data['epc_list'] = ed['elProperties'];
						hit = true;
						break;
					}
				}
			}
			if (hit) {
				break;
			}
		}
	}).catch((error) => {
		console.error(error);
		// モーダルウィンドウ閉じる
		this.modalLoadingClose();
		// エラー表示
		this.modalErrorShow(error.message);
	});
};

// リモートデバイスの EOJ のプルダウンが変更されたときの処理
Elemu.prototype.remoteDeviceDetailChangeDeviceIdEoj = function (event) {
	// プルダウンで選択された項目を取得
	let device_id_eoj = this.components_bind_data['remote-device-detail']['device_id_eoj'];
	let parts = device_id_eoj.split('-');
	let device_id = parts[0];
	let eoj = parts[1];
	// リダイレクト
	this.router.push({ path: '/remoteDevice/' + device_id + '/' + eoj });
};

// プロパティデータ取得アイコンがクリックされたときの処理
Elemu.prototype.remoteDeviceDetailGetEpcData = function (address, eoj, epc) {
	this.modalLoadingShow();
	let bind_data = this.components_bind_data['remote-device-detail'];
	this._webapi.getRemoteDeviceEpcData(address, eoj, epc).then((res) => {
		let epc_data_list = bind_data['epc_list'];
		for (let i = 0; i < epc_data_list.length; i++) {
			let epc_data = epc_data_list[i];
			if (epc_data['epc'] === epc) {
				epc_data['edt'] = res['data']['elProperty']['edt'];
			}
		}
		this.modalLoadingClose();
	}).catch((error) => {
		console.error(error);
		this.modalLoadingClose();
		this.modalErrorShow(error.message);
	});
};

// プロパティデータ一括取得ボタンがクリックされたときの処理
Elemu.prototype.remoteDeviceDetailGetAllEpcData = function (address, eoj) {
	this.modalLoadingShow();
	let bind_data = this.components_bind_data['remote-device-detail'];
	let epc_hex_list = [];
	let epc_data_map = {};
	let epc_data_list = bind_data['epc_list'];
	epc_data_list.forEach((epc_data) => {
		let epc_hex = epc_data['epc'];
		epc_data_map[epc_hex] = epc_data;
		if (epc_data['map']['get']) {
			epc_hex_list.push(epc_hex);
		}
	});
	let getEdt = (cb) => {
		let epc_hex = epc_hex_list.shift();
		if (!epc_hex) {
			cb();
			return;
		}
		this._webapi.getRemoteDeviceEpcData(address, eoj, epc_hex).then((res) => {
			epc_data_map[epc_hex]['edt'] = res['data']['elProperty']['edt'];
			setTimeout(() => {
				getEdt(cb);
			}, 500);
		}).catch((error) => {
			console.error(error);
			setTimeout(() => {
				getEdt(cb);
			}, 500);
		});
	};
	getEdt((error) => {
		this.modalLoadingClose();
	});
};



/* --------------------------------------------------------------
* モーダルウィンドウ表示メソッド
* ------------------------------------------------------------ */

// 処理中
Elemu.prototype.modalLoadingShow = function () {
	let message = 'Now in progress...';
	if (this._lang === 'ja') {
		message = '処理中...';
	}
	$('#modal-loading-message').text(message);
	$('#modal-loading').modal('show');
};

Elemu.prototype.modalLoadingClose = function () {
	setTimeout(() => {
		$('#modal-loading').modal('hide');
	}, 500);
};


// エラー
Elemu.prototype.modalErrorShow = function (message) {
	let title = 'Error';
	if (this._lang === 'ja') {
		title = 'エラー';
	}
	let msg = '';
	if (typeof (message) === 'string') {
		msg = message;
	} else if (typeof (message) === 'object') {
		if (this._lang === 'ja') {
			msg = message['ja'];
		} else {
			msg = message['en'];
		}
	}
	$('#modal-error-title').text(title);
	$('#modal-error-message').text(msg);
	$('#modal-error').modal('show');
};

Elemu.prototype.modalErrorClose = function () {
	setTimeout(() => {
		$('#modal-error').modal('hide');
	}, 500);
};
