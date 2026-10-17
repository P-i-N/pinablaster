function ShowFatalError(message)
{
	var stage = document.getElementById("stage");

	stage.innerHTML = '<div id="fatal"><h1>PiN\'a\'Blaster could not start</h1><p></p></div>';
	stage.querySelector("p").textContent = message;
}

document.addEventListener("DOMContentLoaded", function()
{
	var ok = false;

	try
	{
		ok = Engine.Run(document.getElementById("mainCanvas"), new PiNaBlaster(), 10);
	}
	catch (e)
	{
		ShowFatalError("Startup error: " + e.message);
		return;
	}

	if (!ok)
		ShowFatalError("The engine could not be initialized (is the canvas 2D context available?).");
});
