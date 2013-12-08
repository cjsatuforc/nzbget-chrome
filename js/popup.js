/***
* @TODO: Show postprocessing status. (merge with postqueue)
* @TODO: Take sort order into consideration when adding new posts to history or groups
*/

var dragging = null;

/* "Framework" stuff */ 
function $(o) {
	return document.getElementById(o);
}
function $E(params) {
	var tmp = document.createElement(params.tag);
	if(params.className) tmp.className = params.className;
	if(params.text) tmp.appendChild(document.createTextNode(params.text));
	if(params.styles) for(k in params.styles) {
		tmp.style[k] = params.styles[k];
	}
	if(params.rel) tmp.setAttribute('rel', params.rel);
	return tmp;
}

/* Format stuff */ 
Number.prototype.zeroPad =  function() {
	return (Number(this) < 10 ? '0' : '') + String(this);
};
Number.prototype.formatTimeDiff = function(){ 
	var date = new Date(this),
		diff = (((new Date()).getTime() - date.getTime()) / 1000),
		day_diff = Math.floor(diff / 86400);

	if ( isNaN(day_diff) || day_diff < 0 || day_diff >= 31 )
		return;

	return day_diff == 0 && (
			diff < 60 && "just now" ||
			diff < 120 && "1 min ago" ||
			diff < 3600 && Math.floor( diff / 60 ) + " mins ago" ||
			diff < 7200 && "1 hour ago" ||
			diff < 86400 && Math.floor( diff / 3600 ) + " hours ago") ||
		day_diff == 1 && "Yesterday "+date.getHours().zeroPad()+':'+date.getMinutes().zeroPad() ||
		Number(this).formatDateTime()
};
Number.prototype.formatTimeLeft = function(){
	var hms = '';
	var days = Math.floor(this / 86400);
	var hours = Math.floor((this % 86400) / 3600);
	var minutes = Math.floor((this / 60) % 60);
	var seconds = Math.floor(this % 60);

	if (days > 10) {
		return days + 'd';
	}
	if (days > 0) {	
		return days + 'd ' + hours + 'h';
	}
	if (hours > 0) {
		return hours + 'h ' + minutes.zeroPad() + 'm';
	}
	if (minutes > 0) {
		return minutes + 'm ' + seconds.zeroPad() + 's';
	}

	return seconds + 's';
};
Number.prototype.formatDateTime = function(){
	var x = new Date(this);
	return x.getFullYear()+'-'+x.getMonth().zeroPad()+'-'+x.getDate().zeroPad()+' '+x.getHours().zeroPad()+':'+x.getMinutes().zeroPad()
};

function formatSizeMB(sizeMB, sizeLo) {
	if (sizeLo !== undefined && sizeMB < 100) {
		sizeMB = sizeLo / 1024 / 1024;
	}

	if (sizeMB > 10240) {
		return (sizeMB / 1024.0).toFixed(1) + ' GiB';
	}
	else if (sizeMB > 1024) {
		return (sizeMB / 1024.0).toFixed(2) + ' GiB';
	}
	else if (sizeMB > 100) {
		return sizeMB.toFixed(0) + ' MiB';
	}
	else if (sizeMB > 10) {
		return sizeMB.toFixed(1) + ' MiB';
	}
	else {
		return Number(sizeMB).toFixed(2) + ' MiB';
	}
}

function formatBytes(bytes) {
	var sizes = {1:'KiB', 2:'MiB', 3:'GiB'},
	output = null;

	Object.keys(sizes).reverse().forEach( function(i) {
		if(!output && bytes >= Math.pow(1024, i))
			output = (bytes/Math.pow(1024, i)).toFixed(1) + sizes[i];
	});
	return output ? output : bytes + 'b';
}

function detectGroupStatus(group) {
	group.paused = (group.PausedSizeLo != 0) && (group.RemainingSizeLo == group.PausedSizeLo);
	if (group.post) {
		return 'postprocess';
	}
	else if (group.ActiveDownloads > 0) {
		return 'downloading';
	}
	else if (group.paused) {
		return 'paused';
	}
	else {
		return 'queued';
	}
}

function detectStatus(hist) {
	if (hist.Kind === 'NZB') {
		if (hist.ParStatus == 'FAILURE' || hist.UnpackStatus == 'FAILURE' || hist.MoveStatus == 'FAILURE' || hist.ScriptStatus == 'FAILURE')
			return 'failure';
		else if (hist.ParStatus == 'MANUAL')
			return 'damaged';
		else {
			switch (hist.ScriptStatus) {
				case 'SUCCESS': return 'success';
				case 'UNKNOWN': return 'unknown';
				case 'NONE':
					switch (hist.UnpackStatus) {
						case 'SUCCESS': return 'success';
						case 'NONE':
							switch (hist.ParStatus) {
								case 'SUCCESS': return 'success';
								case 'REPAIR_POSSIBLE': return 'repairable';
								case 'NONE': return 'unknown';
							}
					}
			}
		}
	}
	else if (hist.Kind === 'URL') {
		switch (hist.UrlStatus) {
			case 'SUCCESS': return 'success';
			case 'FAILURE': return 'failure';
			case 'UNKNOWN': return 'unknown';
		}
	}
}

function onGroupsUpdated(){
	$('download_table').style['display'] = Object.keys(api.groups).length > 0 ? 'block' : 'none';

	// Build or update active download list
	for(k in api.groups) {
		downloadPost(api.groups[k]);
	};

	// Remove completed downloads from "Active downloads" and check if sorting is needed
	var i = 0
		,sortNeeded = false
		,trElements = $('download_container').querySelectorAll('div.post');
	for(var k = 0; k<trElements.length; k++) {
		var id = trElements[k].getAttribute('rel');
		if(api.groups[id]) {
			if(i++ != api.groups[id].sortorder) sortNeeded = true;
		}
		else {
			$('download_container').removeChild(trElements[k]);
		}
	}

	if(sortNeeded) {
		order = Object.keys(api.groups).sort(function(a,b) {
			a = api.groups[a].sortorder;
			b = api.groups[b].sortorder;
			if(a < b) return -1;
			if(a > b) return 1;
			return 0;
		});
		for(i in order) {
			var el = $('download_container').querySelector('div.post[rel="' + order[i] + '"]');
			if(el) $('download_container').appendChild($('download_container').removeChild(el));
		}
		
	}

	// Set "global" labels
	if($('lbl_speed').hasChildNodes()) $('lbl_speed').removeChild($('lbl_speed').firstChild);
	if($('lbl_remainingmb').hasChildNodes()) $('lbl_remainingmb').removeChild($('lbl_remainingmb').firstChild);
	$('lbl_speed').appendChild(document.createTextNode(formatBytes(api.status.DownloadRate) + '/s'));
	$('lbl_remainingmb').appendChild(document.createTextNode(formatSizeMB(Number(api.status.RemainingSizeMB), Number(api.status.RemainingSizeLo))));
}

function onHistoryUpdated(){
	api.history(function(j){
		for(var i=0; i<10; i++) {
			historyPost(j.result[i]);
		}
	});
}

function historyPost(item) {
	item.status = detectStatus(item);
	var post = $('history_container').querySelector('[rel="' + item.NZBID + '"]')
		,update	= post !== null;
	
	if(update) {
		post.querySelector('.left').innerText = Number(item.HistoryTime*1000).formatTimeDiff();
	}
	else {
		var post = $E({tag: 'div', className: 'post', rel: item.NZBID});
		post.setAttribute('draggable', true);

		post.addEventListener('dragstart', function(e){
  			dragging = this;
			var dt = e.dataTransfer;
			dt.effectAllowed = 'move';
			dt.setData('Text', 'dummy');
  			dt.setData('text/html', this.innerHTML);
		});
		dover = function (ev) {
			if (ev.type == 'drop') {
				ev.stopPropagation();
				el =this.parentElement.insertBefore(dragging, this.parentElement.querySelector('.placeholder'));
				dragging.dispatchEvent('dragend');
				return false;
			}
			ev.preventDefault();
			ev.dataTransfer.dropEffect = 'move';

			if(this.classList.contains('post')) {
				if(dragging.offsetHeight) 
					dragging.storedHeight = dragging.offsetHeight;
				if(dragging.storedHeight) this.placeholder.style.height = dragging.storedHeight+'px';
				dragging.style.display='none';
				var pholders = this.parentElement.querySelectorAll('div.placeholder');
				for(var i = 0; i<pholders.length; i++) {
					pholders[i].parentNode.removeChild(pholders[i]);
				};

				var i = 0, child = this;
				while( (child = child.previousSibling) != null ) i++;
				this.parentElement.insertBefore(this.placeholder, i < 2 ? this : this.nextSibling);
				console.log(i);
				//$(this)[placeholder.index() < $(this).index() ? 'after' : 'before'](placeholder);
			}
			else if(this.classList.contains('placeholder')) {
				//this.parentElement.replaceChild(this, )
			}
			return false;
		}
		post.addEventListener('dragover', dover);
		post.addEventListener('dragenter', dover);
		post.addEventListener('drop', dover);
		post.addEventListener('dragend', function(){
			if (!dragging) {
				return;
			}
			dragging.style.display='flex';
			var pholders = document.querySelectorAll('div.placeholder');
			for(var i = 0; i<pholders.length; i++) {
				pholders[i].parentNode.removeChild(pholders[i]);
			};
			dragging = null;
		});

			// Tag
			post.appendChild($E({tag: 'div', className: 'tag '+item.status}))
				.appendChild($E({tag: 'span', text: item.status}));

			// Info
			var info = post.appendChild($E({tag: 'div', className: 'info'}));
				info.appendChild($E({tag: 'div', text: item.Name, className: 'title'}));
				var details = info.appendChild($E({tag: 'div', className: 'details'}));
					details.appendChild($E({tag: 'div', text: Number(item.HistoryTime*1000).formatTimeDiff(), className: 'left'}));
					details.appendChild($E({tag: 'div', text: formatSizeMB(item.FileSizeMB, item.FileSizeLo), className: 'right'}));
	
			post.placeholder = $E({tag: 'div', className: 'placeholder'});
			post.placeholder.addEventListener('dragover', dover);
			post.placeholder.addEventListener('dragenter', dover);
			post.placeholder.addEventListener('drop', dover);
			$('history_container').appendChild(post);
	}

	return post;
}

function downloadPost(item) {
	var totalMB		= item.FileSizeMB-item.PausedSizeMB
		,remainingMB= item.RemainingSizeMB-item.PausedSizeMB
		,percent	= Math.round((totalMB - remainingMB) / totalMB * 100)
		,remaining	= formatSizeMB(remainingMB, item.RemainingSizeLo)
		,total		= formatSizeMB(item.FileSizeMB, item.FileSizeLo)
		,estRem		= ((item.RemainingSizeMB-item.PausedSizeMB)*1024/(api.status.DownloadRate/1024)).formatTimeLeft()
		,post		= $('download_container').querySelector('[rel="' + item.NZBID + '"]')
		,update		= post !== null
		,leftLabel	= item.post ? item.post.ProgressLabel : percent+'%'
		,rightLabel	= item.post ? '' : formatSizeMB(item.FileSizeMB, item.FileSizeLo);
	item.status = detectGroupStatus(item);
	if(item.status === 'downloading' || (item.postprocess && !api.status.PostPaused))
		var kind = 'success';
	else if(item.status === 'paused' || (item.postprocess && api.status.PostPaused))
		var kind = 'warning';
	else
		var kind = 'none';

	if(update) {
		post.querySelector('.tag').className = 'tag '+item.status;
		post.querySelector('.tag span').innerText = item.status;
		post.querySelector('.bar-text.left').innerText = leftLabel;
		post.querySelector('.bar-text.right').innerText = rightLabel;
		post.querySelector('.bar').style.width = (percent)+'%';
		post.querySelector('.bar').className = 'bar '+kind;
	}
	else {
		var post = $E({tag: 'div', className: 'post', rel: item.NZBID});
			// Tag
			post.appendChild($E({tag: 'div', className: 'tag '+item.status}))
				.appendChild($E({tag: 'span', text: item.status}));

			// Info
			var info = post.appendChild($E({tag: 'div', className: 'info'}));
				info.appendChild($E({tag: 'div', text: item.NZBName, className: 'title'}));

				var progress = info.appendChild($E({tag: 'div', className:'progress'}));
					progress.appendChild($E({tag: 'div', className: 'bar '+kind, styles: {width: percent+'%'}}));
					progress.appendChild($E({tag: 'div', className: 'bar-text left', text: leftLabel}));
					progress.appendChild($E({tag: 'div', className: 'bar-text right', text: rightLabel}));
		$('download_container').appendChild(post);
	}

	return post;
}

document.addEventListener('DOMContentLoaded', function() {
	window.api = chrome.extension.getBackgroundPage().ngAPI;

	if(!api.isInitialized || !api.connectionStatus) {
		$('download_table').style.display='none';
		$('history_table').style.display='none';
		$('setup_needed').style.display='block';
		return;
	}

	chrome.runtime.onMessage.addListener(
		function(request, sender, sendResponse) {
			switch(request.statusUpdated) {
				case 'groups':
					onGroupsUpdated();
					break;
				case 'history':
					onHistoryUpdated();
					break;
			}
		}
	);
	onGroupsUpdated();
	onHistoryUpdated();
	$('logo').addEventListener('click', function() {
		api.switchToNzbGetTab();
	});
});