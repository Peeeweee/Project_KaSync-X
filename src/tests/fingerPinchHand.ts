import { openHand } from './openHand';

export function fingerPinchHand(bends = [0,0,0], depth = .6, x = 0, y = 0, roll = 0) {
  const world = openHand().map(p => ({x:(p.x-.5)*.6,y:(p.y-.5)*.6,z:0}));
  for (let i=0;i<3;i++) {
    const base = [9,13,17][i], bend = bends[i] ?? 0;
    world[base+1] = {...world[base],y:world[base].y-.025};
    for (const [joint,length] of [[base+2,.018],[base+3,.04]]) {
      world[joint] = {x:world[base].x,y:world[base+1].y-Math.cos(bend)*length,z:-Math.sin(bend)*length};
    }
  }
  world[4] = {...world[8],x:world[8].x+.001};
  for (const p of world) {
    const px=p.x; p.x=px*Math.cos(roll)-p.y*Math.sin(roll); p.y=px*Math.sin(roll)+p.y*Math.cos(roll);
  }
  const image = world.map(p => ({x:.5+(p.x+x)/(p.z+depth),y:.5+(p.y+y)/(p.z+depth)*1280/720,z:p.z/depth}));
  return {image,world};
}
