/*
 * RSS Feed extension for GNOME Shell
 *
 * Copyright (C) 2015
 *     Tomas Gazovic <gazovic.tomasgmail.com>,
 *     Janka Gazovicova <jana.gazovicova@gmail.com>
 *
 * This file is part of gnome-shell-extension-rss-feed.
 *
 * gnome-shell-extension-rss-feed is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * gnome-shell-extension-rss-feed is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with gnome-shell-extension-rss-feed.  If not, see <http://www.gnu.org/licenses/>.
 */

const Lang = imports.lang;
const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Soup = imports.gi.Soup;
const St = imports.gi.St;
const Util = imports.misc.util;
const Gio = imports.gi.Gio;

const Convenience = Me.imports.convenience;
const Parser = Me.imports.parsers.factory;
const Log = Me.imports.logger;
const Settings = Convenience.getSettings();

const Gettext = imports.gettext.domain('rss-feed');
const _ = Gettext.gettext;

const MessageTray = imports.ui.messageTray;

const ExtensionGui = {
    RssPopupMenuItem: Me.imports.extensiongui.rsspopupmenuitem.RssPopupMenuItem,
    RssPopupSubMenuMenuItem: Me.imports.extensiongui.rsspopupsubmenumenuitem.RssPopupSubMenuMenuItem
};

const RSS_FEEDS_LIST_KEY = 'rss-feeds-list';
const UPDATE_INTERVAL_KEY = 'update-interval';
const ITEMS_VISIBLE_KEY = 'items-visible';
const DEBUG_ENABLED_KEY = 'enable-debug';
const ENABLE_NOTIFICATIONS_KEY = 'enable-notifications';
const POLL_DELAY_KEY = 'fpoll-timeout';

const NOTIFICATION_ICON = 'emblem-web';

/*
 * Main RSS Feed extension class
 */
const RssFeedButton = new Lang.Class({

    Name: 'RssFeedButton',
    Extends: PanelMenu.Button,

    /*
	 * Initialize instance of RssFeedButton class
	 */
    _init: function() {
        this.parent(0.0, "RSS Feed");

        this._httpSession = null;
        this._startIndex = 0;
        this._feedsCache = new Array();
        this._feedTimers = new Array();
        this._subMenus = new Array();

        // top panel button
        let icon = new St.Icon({
            icon_name: 'application-rss+xml-symbolic',
            style_class: 'system-status-icon'
        });

        this.actor.add_actor(icon);

        this._feedsBox = new St.BoxLayout({
            vertical: true,
            reactive: false
        });

        this._feedsSection = new PopupMenu.PopupMenuSection();

        this.menu.addMenuItem(this._feedsSection);

        let separator = new PopupMenu.PopupSeparatorMenuItem();
        this.menu.addMenuItem(separator);

        // buttons in bottom menu bar
        this._buttonMenu = new PopupMenu.PopupBaseMenuItem({
            reactive: false
        });

        let systemMenu = Main.panel.statusArea.aggregateMenu._system;
        let prevBtn = systemMenu._createActionButton('go-previous-symbolic', _("Previous"));
        let nextBtn = systemMenu._createActionButton('go-next-symbolic', _("Next"));
        let reloadBtn = systemMenu._createActionButton('view-refresh-symbolic', _("Reload RSS Feeds"));
        let settingsBtn = systemMenu._createActionButton('preferences-system-symbolic', _("RSS Feed Settings"));

        this._lastUpdateTime = new St.Button({label: _("Last update")+': --:--'});

        this._buttonMenu.actor.add_actor(prevBtn);
        this._buttonMenu.actor.add_actor(nextBtn);
        this._buttonMenu.actor.add_actor(this._lastUpdateTime);
        this._buttonMenu.actor.add_actor(reloadBtn);
        this._buttonMenu.actor.add_actor(settingsBtn);

        prevBtn.connect('clicked', Lang.bind(this, this._onPreviousBtnClicked));
        nextBtn.connect('clicked', Lang.bind(this, this._onNextBtnClicked));
        reloadBtn.connect('clicked', Lang.bind(this, this._reloadRssFeeds));
        settingsBtn.connect('clicked', Lang.bind(this, this._onSettingsBtnClicked));

        this.menu.addMenuItem(this._buttonMenu);

        // loading data on startup
        this._reloadRssFeeds();
    },

    /*
	 * Frees resources of extension
	 */
    stop: function() {

        if (this._httpSession)
            this._httpSession.abort();
        this._httpSession = null;

        if (this._scid)
            Settings.disconnect(this._scid);

        if (this._timeout)
            Mainloop.source_remove(this._timeout);

        let t;
        while ( t = this._feedTimers.pop() )    	
        	Mainloop.source_remove(t);        
    },

    /*
	 * Get variables from GSettings
	 */
    _getSettings: function() {

        Log.Debug("Get variables from GSettings");

        // interval for updates
        this._updateInterval = Settings.get_int(UPDATE_INTERVAL_KEY);
        // rss sources visible per page
        this._itemsVisible = Settings.get_int(ITEMS_VISIBLE_KEY);
        // http sources for rss feeds
        this._rssFeedsSources = Settings.get_strv(RSS_FEEDS_LIST_KEY);
        // poll delay
        this._rssPollDelay = Settings.get_int(POLL_DELAY_KEY);
        // enable notifications
        this._enableNotifications = Settings.get_boolean(ENABLE_NOTIFICATIONS_KEY);

        Log.Debug("Update interval: " + this._updateInterval +
                  " Visible items: " + this._itemsVisible +
                  " RSS sources: " + this._rssFeedsSources +
                  " Notification: " + this._enableNotifications);
    },

    /*
	 * On settings button clicked callback
	 */
    _onSettingsBtnClicked: function() {

        this.menu.actor.hide();
        Util.spawn(["gnome-shell-extension-prefs", "rss-feed@gnome-shell-extension.todevelopers.github.com"]);
    },

    /*
	 * On previous button clicked callback
	 */
    _onPreviousBtnClicked: function() {

        /*
		 * this._startIndex -= this._itemsVisible; if (this._startIndex < 0)
		 * this._startIndex = 0 this._refreshExtensionUI();
		 */
    },

    /*
	 * On next button clicked callback
	 */
    _onNextBtnClicked: function() {

        /*
		 * if (this._startIndex + this._itemsVisible <
		 * this._rssFeedsSources.length) { this._startIndex +=
		 * this._itemsVisible; this._refreshExtensionUI(); }
		 */
    },

    /*
	 * Returns JSON object that represents HTTP (GET method) parameters stored
	 * in URL url - HTTP request URL
	 */
    _getParametersAsJson: function(url) {

    	let l2o = url.indexOf('?');    
    	
        if (l2o == -1)
            return "{}";

        let urlParams = url.substr(l2o + 1);
        let params = urlParams.split('&');

        let jsonObj = "{";
        for (let i = 0; i < params.length; i++)
        {
            let pair = params[i].split('=');
            jsonObj += '"' + pair[0] + '":' + '"' + pair[1] + '"';
            if (i != params.length -1)
                jsonObj += ',';
        }
        jsonObj += "}";

        return jsonObj;
    },

    /*
	 * Scheduled reload of RSS feeds from sources set in settings
	 */
    _reloadRssFeeds: function() {

        this._getSettings();

        Log.Debug("Reload RSS Feeds");
        
        // this._feedsArray = new Array(this._rssFeedsSources.length);

        let t;
        
        while ( t = this._feedTimers.pop() )    	
        	Mainloop.source_remove(t);    	
        
        // remove timeout
        if (this._timeout)
            Mainloop.source_remove(this._timeout);

        if (this._rssFeedsSources) {
                	
        	/* cleanup after removed sources */
        	if ( this._feedsCache ) {
        		for (var key in this._feedsCache) { 
        			let h = false;    				
                    
        			for (let j = 0; j < this._rssFeedsSources.length; j++) {
        				let url = this._rssFeedsSources[j];
        				let l2o = url.indexOf('?');                        
                        if (l2o != -1) url = url.substr(0, l2o);
                        
        				if (key == url) {
        					h = true;
        					break;
        				}        					
        			}
        			
        			if ( !h ) {
        				if ( this._feedsCache[key].Menu )
        					this._feedsCache[key].Menu.destroy();
        				delete this._feedsCache[key];
        			}        					
        		}
        	}
        	
            for (let i = 0; i < this._rssFeedsSources.length; i++)
            {
                let url = this._rssFeedsSources[i];
                let jsonObj = this._getParametersAsJson(url);
                
                let l2o = url.indexOf('?');                
                if (l2o != -1) url = url.substr(0, l2o);                               
                
                this._feedTimers.push(
                	Mainloop.timeout_add(i * this._rssPollDelay, Lang.bind(this,function () 
		                {  		
		                	this._httpGetRequestAsync(url, JSON.parse(jsonObj), i, Lang.bind(this, this._onDownload));
		                }))
                );
            }
        }

        // set timeout if enabled
        if (this._updateInterval > 0) {
            Log.Debug("Next scheduled reload after " + this._updateInterval*60 + " seconds");
            this._timeout = Mainloop.timeout_add_seconds(this._updateInterval*60, Lang.bind(this, this._reloadRssFeeds));
        }
    },

    /*
	 * Creates asynchronous HTTP GET request through Soup interface url - HTTP
	 * request URL without parameters params - JSON object of HTTP GET request
	 * parameters position - Position in RSS sources list callback - calls on
	 * HTTP GET request response
	 */
    _httpGetRequestAsync: function(url, params, position, callback) {

        if (this._httpSession == null)
            this._httpSession = new Soup.SessionAsync();

        // Lours974 Vitry David
        // This makes the session work under a proxy. The funky syntax here
        // is required because of another libsoup quirk, where there's a gobject
        // property called 'add-feature', designed as a construct property for
        // C convenience.
        Soup.Session.prototype.add_feature.call(this._httpSession, new Soup.ProxyResolverDefault());

        Log.Debug("[" + position + "] Soup HTTP GET request. URL: " + url + " parameters: " + JSON.stringify(params));

        let request = Soup.form_request_new_from_hash('GET', url, params);

        this._httpSession.queue_message(request, Lang.bind(this, function(httpSession, message) {

            Log.Debug("[" + position + "] Soup HTTP GET reponse. Status code: " + message.status_code +
            " Content Type: " + message.response_headers.get_one("Content-Type"));

            if (message.response_body.data)
                callback(message.response_body.data, position, url);
        }));
    },
    
    _clampTitle: function(title) {	
		if (title.length > 128)
            title = title.substr(0, 128) + "...";
		return title;
    },
    
    /*
	 * On HTTP request response download callback responseData - response data
	 * position - Position in RSS sources list
	 */
    _onDownload: function(responseData, position, sourceURL) {
    	
    	
        let rssParser = new Parser.createRssParser(responseData);

        if (rssParser == null)
            return;

        rssParser.parse();
     
        let nItems = rssParser.Items.length > this._itemsVisible ? this._itemsVisible: rssParser.Items.length;
        
        if (!nItems) 
        {
        	let feedsCache = this._feedsCache[sourceURL];
        	
        	if ( feedsCache )
        	{	
        		feedsCache.Menu.label.set_text(
        				this._clampTitle("[INACTIVE] " + feedsCache.Menu._olabeltext));
        		
        		feedsCache._inactive = true;
        	}
        	
    		return;      
    	}
        
        // initialize the cache array
        if ( !this._feedsCache[sourceURL] ) 
        {
        	this._feedsCache[sourceURL] = new Array();
        	this._feedsCache[sourceURL].Items = new Array();
        }
        
        let feedsCache = this._feedsCache[sourceURL];	
        let itemCache = feedsCache.Items;
                  
        let subMenu;
        
        // create submenu
        if ( !feedsCache.Menu ) 
        {
	        subMenu = new ExtensionGui.RssPopupSubMenuMenuItem(rssParser.Publisher, nItems);
	    	this._feedsSection.addMenuItem(subMenu);    	
	    	feedsCache.Menu = subMenu;
	    	subMenu._olabeltext = subMenu.label.get_text();
	    	subMenu._oicount = nItems;
        } else 
        	subMenu = feedsCache.Menu;
              
        
        if ( feedsCache._inactive )
        {    		
        	subMenu.label.set_text(
    				this._clampTitle(subMenu._olabeltext));    		
    		feedsCache._inactive = null;
        }
                
        // clear the cache
        let i = itemCache.length;
        
        while ( i-- )
		{        	
        	let cacheItemURL = itemCache[i];
        	let j = nItems;
        	let h = false;
        	
        	while ( j-- )
        	{
        		if ( cacheItemURL == rssParser.Items[j].HttpLink ) {
        			h = true;
        			break;
        		}
        	}
        	if ( !h ) 
        	{
        		itemCache[cacheItemURL].destroy();       
        		delete itemCache[cacheItemURL];
        		itemCache.splice(i, 1);
        	}        	
		}		
        
        for (i = 0; i < nItems; i++) 
        {
            let item = rssParser.Items[i];           			
			let itemURL = item.HttpLink;
			
			if ( !itemCache[itemURL] )
			{				
				// trigger notification
				if ( this._enableNotifications &&
						feedsCache._initialRefresh) { 
					let itemTitle = Encoder.htmlDecode(item.Title);
					this._showNotification(itemTitle, item.HttpLink + '\n\nSource: ' +
						 	Encoder.htmlDecode(rssParser.Publisher.Title) +
						 	'\n\n' + itemTitle, item.HttpLink); 
				}
		 
				let menu = new ExtensionGui.RssPopupMenuItem(item);
	            subMenu.menu.addMenuItem(menu, i); 

				itemCache[itemURL] = menu;
				itemCache.splice(i, 0, itemURL);
			}
        }
            
		if ( !feedsCache._initialRefresh )
			feedsCache._initialRefresh = true;
			
        // update last download time
        this._lastUpdateTime.set_label(_("Last update")+': ' + new Date().toLocaleTimeString());
        
        rssParser.clear();

    },
    
    
    /*
	 * Reloads feeds section
	 */
    
    /*
    _refreshExtensionUI: function() {

        this._feedsSection.removeAll();
        
        let counter = 0;

        for (let i = this._startIndex; i < this._feedsArray.length; i++) {

            if (this._feedsArray[i] && this._feedsArray[i].Items) 
            {
                let nItems = this._feedsArray[i].Items.length;                                
                let subMenu = new ExtensionGui.RssPopupSubMenuMenuItem(this._feedsArray[i].Publisher, nItems);
           
                // for (let j = 0; j < nItems ; j++) {

                    // let menuItem = new
					// ExtensionGui.RssPopupMenuItem(this._feedsArray[i].Items[j]);
                    // subMenu.menu.addMenuItem(menuItem);
                	
            	let items = this._feedsArray[i].Items;
            	let c = nItems;
           
            	Mainloop.timeout_add(250, Lang.bind(this,function () {
            		 // Main.notify('-', 'b1');
            		
            		c--;
            		
            		let item = items[c];
            		
            		
            		                		 
					let menuItem = new ExtensionGui.RssPopupMenuItem(item);
					subMenu.menu.addMenuItem(menuItem); 
					
					if ( !c)
						return false;
					
					return true;
                 }));
                // }

                this._feedsSection.addMenuItem(subMenu);
               
				// dispatch notifications for new items
                let pubURL = this._feedsArray[i].Publisher.URL;
				 
				while (nItems--) { 
					 let item = this._feedsArray[i].Items[nItems]; 
				 
					 let itemURL =	 Encoder.htmlDecode(item.HttpLink);
				 
					 if ( !this._feedsCache[pubURL][itemURL] ) { 
						 if ( this._enableNotifications &&
							  this._feedsCache[pubURL]._initialRefresh ) { 
							 let itemTitle = Encoder.htmlDecode(item.Title);
							 this._showNotification(itemTitle, item.HttpLink + '\n\nSource: ' +
									 	Encoder.htmlDecode(this._feedsArray[i].Publisher.Title) +
									 	'\n\n' + itemTitle, item.HttpLink); 
						 }
				 
						 this._feedsCache[pubURL][itemURL] = true; 
					 } 
				}
				 
				if ( !this._feedsCache[pubURL]._initialRefresh )
					this._feedsCache[pubURL]._initialRefresh = true;
				 
            }
            else {

                let subMenu = new PopupMenu.PopupMenuItem(_("No data available"));
                this._feedsSection.addMenuItem(subMenu);
            }

            counter++;

            if (counter == this._itemsVisible)
                break;

        }
    },
*/
    _getDefaultBrowser: function() {
    	let browser;
        try {
        	browser = Gio.app_info_get_default_for_uri_scheme("http").get_executable();
        }
        catch (err) {
        	browser = "epiphany";
        }
        return browser;
    },
    
    _showNotification: function(title, message, url) {

        let Source = new MessageTray.SystemNotificationSource();
        Source.createIcon = function() {
                return new St.Icon({ icon_name: NOTIFICATION_ICON });
        };
      
        Main.messageTray.add(Source);
        
        let notification = new MessageTray.Notification(Source, title, message);
        
        if ( url ) {
        	notification.addAction( _('Open URL') , Lang.bind(this, function() {
        				Util.trySpawnCommandLine(this._getDefaultBrowser() + ' ' + url);  
        	}) );
        	notification.addAction( _('Copy URL') , Lang.bind(this, function() {
        		St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, url);
        	}) );
        }

        notification.setTransient(false);
        notification.setResident(true);
        
        Source.notify(notification);
    }

});

/*
 * Extension widget instance
 */
let rssFeedBtn;

/*
 * Initialize the extension
 */
function init() {
    Convenience.initTranslations("rss-feed");

    // hack for dconf
    let enabled = Settings.get_boolean(DEBUG_ENABLED_KEY);
    Settings.set_boolean(DEBUG_ENABLED_KEY, enabled);

    Log.Debug("Extension initialized.");
}

/*
 * Enable the extension
 */
function enable() {

    rssFeedBtn = new RssFeedButton();
    Main.panel.addToStatusArea('rssFeedMenu', rssFeedBtn, 0, 'right');

    Log.Debug("Extension enabled.");
}

/*
 * Disable the extension
 */
function disable() {

    rssFeedBtn.stop();
    rssFeedBtn.destroy();

    Log.Debug("Extension disabled.");
}
