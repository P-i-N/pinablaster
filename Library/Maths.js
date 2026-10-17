function BoxIntersection(ax1, ay1, ax2, ay2, bx1, by1, bx2, by2)
{
	if (ax1 >= bx1 && ax2 <= bx2 && ay1 >= by1 && ay2 <= by2)
		return true;
		
	if (bx2 < ax1 || bx1 > ax2) return false;
	if (by2 < ay1 || by1 > ay2) return false;
	
	return true;
}

function BoxOverlapFactor(ax1, ay1, ax2, ay2, bx1, by1, bx2, by2)
{
	var mx1 = ax1;
	var my1 = ay1;
	var mx2 = ax1;
	var my2 = ay1;
	
	mx1 = ax1 >= bx1 ? ax1 : bx1;
	my1 = ay1 >= by1 ? ay1 : by1;
	mx2 = ax2 <= bx2 ? ax2 : bx2;
	my2 = ay2 <= by2 ? ay2 : by2;
	
	var mx = mx2 - mx1;
	var my = my2 - my1;
	
	var ax = ax2 - ax1;
	var ay = ay2 - ay1;
	
	return Math.sqrt(mx * my) / Math.sqrt(ax * ay);
}

