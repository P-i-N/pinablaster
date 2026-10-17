// Animated sprite class
function Sprite()
{
	this.Frames = [];
	this.Phase = 0.0;
	this.AnimationSpeed = 2.5;
	this.Loop = true;
	this.OffsetX = 0;
	this.OffsetY = 0;
	this.IndexOffset = 0;
    this.Alpha = 1.0;
    this.Visible = true;
	this.Sheet = null;
	
	var isFinished = false;
	
	this.Tick = function(delta)
	{
		this.Phase += delta * this.AnimationSpeed * this.Frames.length;
		
		if (this.Phase >= this.Frames.length)
		{
			if (this.Loop)
			{
				this.Phase -= this.Frames.length;
				isFinished = false;
			}
			else
			{
				this.Phase = this.Frames.length;
				isFinished = true;
			}			
		}	
	}
	
	this.GetActualFrame = function()
	{
		if (this.Frames.length == 0)
			return this.IndexOffset + 0;
	
		if (this.Phase <= 0.0)
			return this.IndexOffset + this.Frames[0];
			
		if (this.Phase >= this.Frames.length - 1)
			return this.IndexOffset + this.Frames[this.Frames.length - 1];
			
		return this.IndexOffset + this.Frames[Math.floor(this.Phase)];		
	}
	
	this.IsFinished = function()
	{
		return isFinished;	
	}
}
