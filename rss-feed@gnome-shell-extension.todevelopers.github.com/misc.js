/*
 * RSS Feed extension for GNOME Shell
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
const
Me = imports.misc.extensionUtils.getCurrentExtension();
const
Gio = imports.gi.Gio;
const
Util = imports.misc.util;
const
PopupMenu = imports.ui.popupMenu;

const
Log = Me.imports.logger;

function getDefaultBrowser()
{
	let
	browser;
	try
	{
		browser = Gio.app_info_get_default_for_uri_scheme("http")
				.get_executable();
	}
	catch (err)
	{
		browser = "epiphany";
	}
	return browser;
}

function processLinkOpen(url, cacheObj)
{
	Util.trySpawnCommandLine(getDefaultBrowser() + ' ' + url);

	if (cacheObj && cacheObj.Unread)
	{
		cacheObj.Unread = null;

		if (cacheObj.Menu)
			cacheObj.Menu.setOrnament(PopupMenu.Ornament.NONE);

		let
		feedCacheObj = cacheObj.parent;

		if (feedCacheObj)
		{
			feedCacheObj.UnreadCount--;

			let
			subMenu = feedCacheObj.Menu;

			subMenu.label.set_text(clampTitle(subMenu._olabeltext
					+ (!feedCacheObj.UnreadCount ? '' : (' ('
							+ feedCacheObj.UnreadCount + ')'))));

			feedCacheObj.pUnreadCount = feedCacheObj.UnreadCount;

			let
			parentClass = feedCacheObj.parentClass;

			if (parentClass)
			{
				parentClass._totalUnreadCount--;
				parentClass
						._updateUnreadCountLabel(parentClass._totalUnreadCount);
			}

			if (!feedCacheObj.UnreadCount)
			{
				subMenu.setOrnament(PopupMenu.Ornament.NONE);
			}
		}
	}
}

function clampTitle(title)
{
	if (title.length > 128)
		title = title.substr(0, 128) + "...";
	return title;
}
