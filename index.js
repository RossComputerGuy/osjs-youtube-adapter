const fetchCommentPage = require("youtube-comment-api");
const fetchVideoInfo = require("youtube-info");
const search = require("youtube-search");
const ypi = require("youtube-channel-videos");
const ytdl = require("ytdl-core");
const youtube = require("youtube-api");
const ytlist = require("youtube-playlist");

const pathBuilder = path => {
	path = path.split(":/")[1];
	if(path.startsWith("/")) path = path.replace("/","");
	if(path[path.length-1].length == 0) path.slice(-1);
	if(path.length == 0) return { path };
	path = path.split("/");
	if(path[path.length-1].length == 0) path.slice(-1);
	if(path.length < 2) return { path };
	if(path[path.length-1].length == 0) path.slice(-1);
	var type = path.shift();
	var id = path.shift();
	return { type, id, path };
};

console.log(youtube);

const getChannelVideos = (channelID,maxResults,pageToken,callStackSize,currentItems,cb) => {
	youtube.search.list({
		type: "video",
		part: "snippet",
		pageToken: pageToken,
		maxResults: maxResults,
		channelId: channelID,
	},(err,data) => {
		if(err) return cb(err);
		for(var x in data.items) currentItems.push(data.items[x]);
		if(data.nextPageToken) return getChannelVideos(channelID,maxResults,pageToken,callStackSize+1,currentItems,cb);
		cb(null,currentItems);
	});
};

const getChannelComments = (id,pageToken,callStackSize,currentItems,cb) => {
	fetchCommentPage(id,pageToken).then(data => {
		for(var x in data.items) currentItems.push(data.items[x]);
		if(data.nextPageToken) return getChannelComments(id,pageToken,callStackSize+1,currentItems,cb);
		cb(null,currentItems);
	}).catch(err => cb(err));
};

const getPlaylists = (id,maxResults,pageToken,callStackSize,currentItems,cb) => {};

module.exports = core => ({
	readdir: vfs => path => new Promise(async (resolve,reject) => {
		youtube.authenticate({
			type: "key",
			key: vfs.mount.attributes.key
		});
		var pathObj = pathBuilder(path);
		if(pathObj.path.length == 0 && typeof(pathObj.id) == "undefined") {
			resolve([]);
		} else {
			switch(pathObj.type) {
				case "channel":
					if(typeof(pathObj.id) == "string") {
						if(pathObj.path.length == 0) {
							resolve([
								{
									isDirectory: false,
									isFile: true,
									size: 0,
									path: vfs.mount.name+"://channel/"+pathObj.id+"/videos.json",
									filename: "videos.json",
									mime: "application/json"
								}
							]);
						} else {
							switch(pathObj.path[0]) {
								default: reject(new Error("Invalid dir"));
							}
						}
					} else reject(new Error("Invalid channel ID"));
					break;
				case "playlist":
					if(typeof(pathObj.id) == "string") {
						if(pathObj.path.length == 0) {
							resolve([
								{
									isDirectory: false,
									isFile: true,
									size: 0,
									path: vfs.mount.name+"://playlist/"+pathObj.id+"/videos.json",
									filename: "videos.json",
									mime: "application/json"
								}
							]);
						} else {
							switch(pathObj.path[0]) {
								default: reject(new Error("Invalid dir"));
							}
						}
					} else reject(new Error("Invalid playlist ID"));
					break;
				case "videos":
					if(typeof(pathObj.id) == "string") {
						if(pathObj.path.length == 0) {
							const info = await fetchVideoInfo(pathObj.id);
							resolve([
								{
									isDirectory: false,
									isFile: true,
									size: 0,
									path: vfs.mount.name+"://video/"+pathObj.id+"/stream.mp4",
									filename: "stream.mp4",
									mime: "video/mp4"
								},
								{
									isDirectory: false,
									isFile: true,
									size: JSON.stringify(info).length,
									path: vfs.mount.name+"://video/"+pathObj.id+"/info.json",
									filename: "info.json",
									mime: "application/json"
								},
								{
									isDirectory: false,
									isFile: true,
									size: 0,
									path: vfs.mount.name+"://video/"+pathObj.id+"/comments.json",
									filename: "comments",
									mime: "application/json"
								}
							]);
						} else {
							switch(pathObj.path[0]) {
								default: reject(new Error("Invalid dir"));
							}
						}
					} else reject(new Error("Invalid video ID"));
					break;
				default: reject(new Error("Invalid path"));
			}
		}
	}),
	readfile: vfs => (path,options={}) => new Promise((resolve,reject) => {
		youtube.authenticate({
			type: "key",
			key: vfs.mount.attributes.key
		});
		var pathObj = pathBuilder(path);
		try {
			switch(pathObj.type) {
				case "channel":
					switch(pathObj.path[0]) {
						case "videos.json":
							getChannelVideos(pathObj.id,vfs.mount.attributes.maxResults,null,0,[],(err,items) => {
								if(err) return reject(err);
								resolve(require("string-to-stream")(JSON.stringify(items)));
							});
							break;
					}
					break;
				case "playlist":
					switch(pathObj.path[0]) {
						case "videos.json":
							ytlist("https://www.youtube.com/playlist?list="+pathObj.id,"url").then(res => {
								resolve(require("string-to-stream")(JSON.stringify(res.data.playlist)));
							}).catch(err => reject(err));
							break;
						case "info.json":
							break;
					}
					break;
				case "video":
					switch(pathObj.path[0]) {
						case "info.json":
							fetchVideoInfo(pathObj.id,(err,info) => {
								if(err) return reject(err);
								resolve(require("string-to-stream")(JSON.stringify(info)));
							});
							break;
						case "comments.json":
							getChannelComments(pathObj.id,null,0,[],(err,items) => {
								if(err) return reject(err);
								resolve(require("string-to-stream")(JSON.stringify(items)));
							});
							break;
						case "stream.mp4":
							return resolve(ytdl("http://www.youtube.com/watch?v="+pathObj.id,{ filter: (format) => format.container == "mp4" }));
						default: reject(new Error("Invalid file"));
					}
					break;
				default: reject(new Error("Invalid file"));
			}
		} catch(ex) {
			reject(ex);
		}
	}),
	search: vfs => (root,pattern) => new Promise((resolve,reject) => {
		search(pattern,{
			key: vfs.mount.attributes.key,
			maxResults: vfs.mount.attributes.maxResults
		},(err,results) => {
			if(err) return reject(err);
			var videos = [];
			for(var result of results) {
				videos.push({
					isDirectory: true,
					isFile: false,
					path: vfs.mount.name+"://video/"+result.id,
					filename: result.id,
					mime: null
				});
			}
			resolve(videos);
		});
	})
});
