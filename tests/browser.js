// Run this expression with the collaborative browser on the local viewer.
(async () => {
  const results = [];
  const assert = (ok, name) => { if (!ok) throw new Error(name); results.push(name); };
  const wait = async predicate => {
    for (let n = 0; n < 150; n++) { if (predicate()) return; await new Promise(r => setTimeout(r, 40)); }
    throw new Error('Timed out waiting for preview');
  };
  const frame = document.createElement('iframe');
  frame.style.cssText = 'width:420px;height:700px;position:fixed;inset:0;z-index:9999';
  const html = await (await fetch('/index.html')).text();
  const source = 'flowchart LR\n A[Start] --> B[Next] --> C[More] --> D[Finish]';
  const messages = [];
  const listener = event => {
    if (event.source !== frame.contentWindow) return;
    messages.push(event.data);
    if (event.data.type === 'ready') frame.contentWindow.postMessage({type:'document', text:source, name:'test.mmd', settings:{engine:'pele',responsive:true}}, '*');
  };
  window.addEventListener('message', listener);
  frame.srcdoc = html.replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' 'nonce-test'; style-src 'self' 'unsafe-inline'; img-src blob: data:; connect-src 'none';"><script nonce="test">window.acquireVsCodeApi=()=>({getState:()=>({}),setState:()=>{},postMessage:m=>parent.postMessage(m,'*')});</script>`);
  document.body.append(frame);
  try {
    await wait(() => frame.contentDocument.querySelector('#canvas svg'));
    const doc = frame.contentDocument, win = frame.contentWindow;
    const svg = () => doc.querySelector('#canvas svg');
    assert(svg().textContent.includes('Start'), 'Webview ready handshake renders Pele under CSP');
    assert(!win.mermaid, 'Mermaid is not loaded for Pele');
    assert(doc.body.scrollWidth <= 420, 'Toolbar fits a narrow side panel');
    assert(svg().viewBox.baseVal.height > svg().viewBox.baseVal.width, 'Responsive Pele adapts direction');
    doc.querySelector('#responsive').click();
    await wait(() => doc.querySelector('#zoomLabel').textContent === '100%' && svg().viewBox.baseVal.width > svg().viewBox.baseVal.height);
    assert(true, 'Fixed mode preserves natural layout at 100%');
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
