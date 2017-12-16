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
Me = imports.misc.extensionUtils.getCurrentExtension();

const
Convenience = Me.imports.convenience;
const
Settings = Convenience.getSettings();

const
GSAA = new Lang.Class(
{
	Name : 'GSAA',

	_init : function(key)
	{
		if (!key)
			throw "GSAA._init: missing key";

		this._gsKey = key;
		this._gsData = new Object();

		this.load();
	},

	destroy : function()
	{
		delete this._gsData;
	},

	load : function()
	{
		let
		data = Settings.get_string(this._gsKey);

		if (!data)
			throw "GSAA.load: could not read data (" + this._gsKey + ")";

		this._gsData = JSON.parse(data);

		return true;
	},

	dump : function()
	{
		if (!this._gsData)
			return false;

		let
		data = JSON.stringify(this._gsData);

		Settings.set_string(this._gsKey, data);

		return true;
	},

	get : function(key, subkey)
	{
		if (this.autoload != false)
			this.load();

		let
		data = this._gsData[key];

		if (!data)
			return undefined;

		return data[subkey];
	},

	set : function(key, subkey, value)
	{
		this.load();

		let
		data = this._gsData[key];

		if (!data)
			data = this._gsData[key] = new Object();

		data[subkey] = value;

		this.dump();
	},

	remove : function(key)
	{
		this.load();

		if (!this._gsData[key])
			return;

		this._gsData[key] = undefined;

		this.dump();
	},

	rename : function(from, to)
	{
		this.load();

		let
		data = this._gsData[from];

		if (!data)
			return false;

		this._gsData[to] = data;
		delete this._gsData[from];

		this.dump();

		return true;
	},

	set_autoload : function(sw)
	{
		this.autoload = sw;
	}
});
