////////////////////////////////////////////////////////////////////////////////
//
//  Array prototype enhancements (non-enumerable, native indexOf is kept)
//
////////////////////////////////////////////////////////////////////////////////
Object.defineProperty(Array.prototype, "contains",
{
	value: function(obj)
	{
		return this.indexOf(obj) >= 0;
	},
	writable: true,
	configurable: true
});

Object.defineProperty(Array.prototype, "remove",
{
	value: function(obj)
	{
		var index = this.indexOf(obj);
		if (index < 0) return false;

		this.splice(index, 1);

		return true;
	},
	writable: true,
	configurable: true
});

////////////////////////////////////////////////////////////////////////////////
//
//  String prototype enhancements 
//
////////////////////////////////////////////////////////////////////////////////
Object.defineProperty(String.prototype, "setCharAt",
{
	value: function(index, chr)
	{
		if (index > this.length - 1) return String(this);

		return this.substr(0, index) + chr + this.substr(index + 1);
	},
	writable: true,
	configurable: true
});
