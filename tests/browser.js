// Run this expression with the collaborative browser on the local viewer.
(async () => {
  const results = [];
  const assert = (ok, name) => { if (!ok) throw new Error(name); results.push(name); };
  const wait = async predicate => {
    for (let n = 0; n < 150; n++) { if (predicate()) return; await new Promise(r => setTimeout(r, 40)); }
    throw new Error('Timed out waiting for preview');
  };
  const frame = document.createElement('iframe');
  frame.style.cssText = 'border:0;width:420px;height:700px;position:fixed;inset:0;z-index:9999';
  const html = await (await fetch('/index.html')).text();
  const source = 'flowchart LR\n A[Start] --> B[Next] --> C[More] --> D[Finish]';
  const messages = [];
  const listener = event => {
    if (event.source !== frame.contentWindow) return;
    messages.push(event.data);
    if (event.data.type === 'ready') frame.contentWindow.postMessage({type:'document', text:source, name:'test.mmd', settings:{engine:'pele',responsive:true}}, '*');
  };
  window.addEventListener('message', listener);
  frame.srcdoc = html.replace('<head>', `<head><style>body { padding: 0 20px; }</style><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' 'nonce-test'; style-src 'self' 'unsafe-inline'; img-src blob: data:; connect-src 'none';"><script nonce="test">window.acquireVsCodeApi=()=>({getState:()=>({}),setState:()=>{},postMessage:m=>parent.postMessage(m,'*')});</script>`);
  document.body.append(frame);
  try {
    await wait(() => frame.contentDocument.querySelector('#canvas svg'));
    const doc = frame.contentDocument, win = frame.contentWindow;
    const svg = () => doc.querySelector('#canvas svg');
    assert(svg().textContent.includes('Start'), 'Webview ready handshake renders Pele under CSP');
    assert(!win.mermaid, 'Mermaid is not loaded for Pele');
    assert(getComputedStyle(doc.querySelector('#open')).display === 'none', 'Open file is hidden in VS Code');
    doc.querySelector('#open').click();
    doc.body.dispatchEvent(new win.KeyboardEvent('keydown', {key:'o',ctrlKey:true,bubbles:true}));
    assert(!messages.some(m => m.type === 'open'), 'Webview cannot request other files');
    const stage = doc.querySelector('#stage');
    assert(stage.getBoundingClientRect().left === 0 && stage.clientWidth === 420, 'Webview padding is removed edge to edge');
    const centered = () => {
      const a = svg().getBoundingClientRect(), b = stage.getBoundingClientRect();
      return Math.abs(a.x + a.width / 2 - b.x - b.width / 2) < 1 && Math.abs(a.y + a.height / 2 - b.y - b.height / 2) < 1;
    };
    assert(doc.body.scrollWidth <= 420, 'Toolbar fits a narrow side panel');
    assert(doc.querySelector('#optionsMenu').contains(doc.querySelector('#engine')) && doc.querySelector('#optionsMenu').contains(doc.querySelector('#responsive')), 'Rendering preferences live in Options');
    for (const width of [320, 420]) {
      frame.style.width = `${width}px`;
      await new Promise(r => setTimeout(r, 200));
      const controls = ['#zoomLabel', '#fit', '#optionsBtn', '#exportBtn'].map(s => doc.querySelector(s).getBoundingClientRect());
      assert(controls.every(r => r.left >= 0 && r.right <= width && Math.abs(r.y - controls[0].y) <= 1), `Toolbar stays on one row at ${width}px`);
      doc.querySelector('#optionsBtn').click();
      const menu = doc.querySelector('#optionsMenu').getBoundingClientRect();
      assert(menu.left >= 0 && menu.right <= width, `Options stay within ${width}px`);
      doc.querySelector('#optionsBtn').click();
    }
    assert(svg().viewBox.baseVal.height > svg().viewBox.baseVal.width, 'Responsive Pele adapts direction');
    doc.querySelector('#responsive').click();
    await wait(() => doc.querySelector('#zoomLabel').textContent === '100%' && svg().viewBox.baseVal.width > svg().viewBox.baseVal.height);
    assert(centered(), 'Disabling responsive centers the natural-size diagram');
    const fixedSVG = svg();
    frame.style.width = '540px';
    await wait(() => stage.clientWidth === 540 && centered());
    assert(svg() === fixedSVG, 'Fixed-mode resize centers without rendering again');
    doc.querySelector('#responsive').click();
    await wait(() => svg() !== fixedSVG && centered());
    assert(true, 'Enabling responsive recenters the diagram');
    const responsiveSVG = svg();
    frame.style.height = '600px';
    await wait(() => stage.clientHeight === 600 - doc.querySelector(".bar").offsetHeight && centered());
    assert(svg() === responsiveSVG, 'Height-only resize does not rebuild the diagram');
    doc.querySelector('[data-zoom="in"]').click();
    const zoom = doc.querySelector('#zoomLabel').textContent;
    frame.style.width = '420px';
    await new Promise(r => setTimeout(r, 250));
    assert(doc.querySelector('#zoomLabel').textContent === zoom, 'Manual zoom survives a responsive resize');
    doc.querySelector('#responsive').click();
    await wait(() => doc.querySelector('#zoomLabel').textContent === '100%' && centered());
    doc.querySelector('#optionsBtn').click();
    assert(!doc.querySelector('#optionsMenu').hidden, 'Options open from toolbar');
    doc.querySelector('#theme').dispatchEvent(new win.KeyboardEvent('keydown', {key:'Escape',bubbles:true}));
    assert(doc.querySelector('#optionsMenu').hidden && doc.activeElement.id === 'optionsBtn', 'Escape closes options and restores focus');
    doc.querySelector('[data-export="svg"]').click();
    doc.querySelector('[data-export="png@2"]').click();
    await wait(() => messages.some(m => m.type === 'export' && m.ext === 'png'));
    assert(messages.some(m => m.ext === 'svg' && atob(m.data).includes('--pele-bg')), 'SVG export embeds theme variables');
    assert(messages.some(m => m.ext === 'png' && m.data.startsWith('iVBOR')), 'Pele PNG export produces a valid PNG');
    assert(!win.jspdf, 'PDF library stays unloaded until export');
    assert(!doc.querySelector('[data-export="pdf"]').hidden, 'PDF is available in the extension');
    doc.querySelector('[data-export="pdf"]').click();
    await wait(() => messages.some(m => m.ext === 'pdf'));
    assert(atob(messages.find(m => m.ext === 'pdf').data).startsWith('%PDF-'), 'Pele PDF export produces a PDF under CSP');
    const engine = doc.querySelector('#engine'); engine.value = 'mermaid'; engine.dispatchEvent(new win.Event('change'));
    await wait(() => svg()?.id?.startsWith('diagram'));
    assert(doc.querySelector('#err').hidden, 'Mermaid renders in webview CSP');
    doc.body.classList.add('vscode-dark');
    await wait(() => doc.documentElement.dataset.theme === 'dark');
    assert(true, 'Automatic theme follows VS Code');
    doc.querySelector('[data-export="png@1"]').click();
    await wait(() => messages.filter(m => m.type === 'export' && m.ext === 'png').length === 2);
    assert(true, 'Mermaid PNG export works under webview CSP');
    doc.querySelector('[data-export="pdf"]').click();
    await wait(() => messages.filter(m => m.ext === 'pdf').length === 2);
    for (const palette of ['ocean', 'plum', 'sand', 'graphite']) {
      const previous = svg();
      const select = doc.querySelector('#theme'); select.value = palette;
      select.dispatchEvent(new win.Event('change'));
      await wait(() => svg() !== previous);
      assert(doc.querySelector('#err').hidden, `Mermaid renders the ${palette} theme`);
    }
    const pdfs = messages.filter(m => m.ext === 'pdf');
    assert(atob(pdfs[1].data).startsWith('%PDF-'), 'Mermaid PDF export produces a PDF under CSP');
    window.testPDFs = pdfs.map(m => m.data);
    win.postMessage({type:'document',text:'flowchart TD\n X[Latest] --> Y[Change]',name:'test.mmd',settings:{engine:'pele',responsive:true}}, '*');
    await wait(() => svg()?.textContent.includes('Latest'));
    assert(true, 'Unsaved document message updates preview');
    win.postMessage({type:'document',text:'',name:'test.mmd',settings:{engine:'pele',responsive:true}}, '*');
    await wait(() => !svg());
    assert(doc.querySelector('#err').hidden, 'Empty document clears stale preview');
    win.postMessage({type:'document',text:'not a diagram',name:'test.mmd',settings:{engine:'pele',responsive:true}}, '*');
    await wait(() => !doc.querySelector('#err').hidden);
    assert(true, 'Invalid document displays a readable error');
    return results;
  } finally { frame.remove(); window.removeEventListener('message', listener); }
})()
