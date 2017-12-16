/*
 * RSS Feed extension for GNOME Shell
 *
 * Copyright (C) 2017
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
Lang = imports.lang;
const
PopupMenu = imports.ui.popupMenu;
const
Gtk = imports.gi.Gtk;

const
Me = imports.misc.extensionUtils.getCurrentExtension();
const
Log = Me.imports.logger;

const
RssPopupSubMenu = new Lang.Class(
{
	Name : 'RssPopupSubMenu',
	Extends : PopupMenu.PopupSubMenu,

	_init : function(sourceActor, sourceArrow)
	{
		this.parent(sourceActor, sourceArrow);

		/* pass any 'scoll-event' to the parent */
		this.actor.connect('scroll-event', Lang.bind(this, function(actor, event)
		{
			let
			scrollBar = this._parent.actor.get_vscroll_bar();
			if (scrollBar)
				scrollBar.emit('scroll-event', event);
		}));

	},

	open : function(animate)
	{
		/*
		let
		needsScrollbar = this._parent._needsScrollbar(this);

		this._parent.actor.vscrollbar_policy = (needsScrollbar ? Gtk.PolicyType.AUTOMATIC
			: Gtk.PolicyType.NEVER);
		 */
		this.parent(this._parent._animate);
	},

	close : function(animate)
	{
		this.parent(this._parent._animate);
	},

	_needsScrollbar : function(o)
	{
		return false;
	}

});
