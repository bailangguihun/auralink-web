import test from 'node:test';
import assert from 'node:assert/strict';
// Browser-native module, also served without a build transform.
// @ts-expect-error The reference runtime uses native JavaScript modules.
import {fittedArtwork} from '../public/community-v2/room-canvas.mjs';

test('portrait and landscape artwork fit without the old SVG letterboxing across devices',()=>{
  for(const stage of [[778,508],[789,570],[543,570],[420,360]]){
    for(const image of [[1000,2000],[2000,1000],[1000,1000]]){
      const box=fittedArtwork(...stage,...image);
      assert(Math.abs(box.width/box.height-image[0]/image[1])<1e-10);
      assert(box.width<=stage[0]*.9+1e-8&&box.height<=stage[1]*.9+1e-8);
    }
  }
  assert.equal(fittedArtwork(0,500,1000,2000),null);
});
