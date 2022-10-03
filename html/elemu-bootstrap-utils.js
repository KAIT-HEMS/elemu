/* ---------------------------------------------------------
* Bootstrap の collapse の +/- アイコン変更
* ------------------------------------------------------- */

function ElemuBootstrapUtils() {

};

ElemuBootstrapUtils.prototype.enableCollapse = function () {
	$('.collapse').on('hidden.bs.collapse', (event) => {
		let id = event.target.id;
		let el = $('a[data-target="#' + id + '"]');
		el.find('i.fas').prop('hidden', true);
		el.find('i.fa-plus').prop('hidden', false);
	});
	$('.collapse').on('show.bs.collapse', (event) => {
		let id = event.target.id;
		let el = $('a[data-target="#' + id + '"]');
		el.find('i.fas').prop('hidden', true);
		el.find('i.fa-minus').prop('hidden', false);
	});
};