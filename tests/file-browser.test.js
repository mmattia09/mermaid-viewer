import { test, expect } from 'bun:test';
import { JSDOM } from 'jsdom';
import { createFileBrowser } from '../public/file-browser.js';

test('a late directory response cannot replace the newest selection', async () => {
  const dom = new JSDOM('<body><main id="stage"></main><div id="picker" hidden><button id="pickerClose"></button><nav id="crumbs"></nav><ul id="listing"></ul><footer id="recents"></footer></div><div id="err"></div></body>');
  const previous = Object.fromEntries(['document','addEventListener','fetch'].map(k => [k, globalThis[k]]));
  const responses = [];
  Object.assign(globalThis, {
    document:dom.window.document,
    addEventListener:dom.window.addEventListener.bind(dom.window),
    fetch:() => new Promise(resolve => responses.push(data => resolve({json:async()=>data}))),
  });
  const data = { path:'/root', roots:['/root'], parent:null, dirs:[] };
  const browser = createFileBrowser({
    stage:document.querySelector('#stage'), storage:{getItem:()=>null,setItem:()=>{}},
    setSource:()=>{}, getSource:()=>'', setLive:()=>{}, errBox:document.querySelector('#err'),
  });
  try {
    browser.open(); browser.open();
    responses[1]({...data,files:['new.mmd']});
    await new Promise(resolve => setTimeout(resolve,0));
    responses[0]({...data,files:['old.mmd']});
    await new Promise(resolve => setTimeout(resolve,0));
    expect(document.querySelector('#listing').textContent).toContain('new.mmd');
    expect(document.querySelector('#listing').textContent).not.toContain('old.mmd');
  } finally { browser.close(); Object.assign(globalThis,previous); dom.window.close(); }
});
