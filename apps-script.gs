// Mis finanzas + Registro de viajes — UN SOLO script para las dos apps.
// Pega TODO este código en Extensiones > Apps Script de tu Google Sheet "Mis finanzas".
// Pon en TOKEN el mismo código secreto que ya usas en «Mis finanzas» (las dos apps usan el mismo).
// Después: Implementar > Administrar implementaciones > lápiz > Versión: Nueva versión > Implementar.
// La URL no cambia, así que «Mis finanzas» sigue funcionando sin tocar nada.
var TOKEN = 'CAMBIA-ESTE-CODIGO';
var HOJA = 'Registro';

// Punto de entrada: cada app se identifica y se manda a su parte del script.
function doPost(e){
  var app = '';
  try{ app = JSON.parse(e.postData.contents).app || ''; }catch(x){}
  if(app === 'viajes') return viajesPost_(JSON.parse(e.postData.contents));
  return finanzasPost_(e);   // «Mis finanzas» (sin cambios)
}

// ══════════ Mis finanzas (código original, sin cambios) ══════════


function out_(o){
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function doGet(e){
  if(!e||!e.parameter||e.parameter.token!==TOKEN) return out_({ok:false,error:'token'});
  return out_({ok:true});
}
function dateStr_(v){
  var tz = Session.getScriptTimeZone();
  if(Object.prototype.toString.call(v)==='[object Date]') return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  var s = String(v).trim(), m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(m) return m[3]+'-'+('0'+m[2]).slice(-2)+'-'+('0'+m[1]).slice(-2);
  return s;
}
function readItems_(sh){
  var last = sh.getLastRow(), items = [];
  if(last<2) return items;
  var vals = sh.getRange(2,1,last-1,6).getValues();
  vals.forEach(function(r,i){
    var f = String(r[5]||'');
    if(f.indexOf('app:')!==0) return;
    var id = f.slice(4), amt = Number(r[4]);
    if(!id||isNaN(amt)) return;
    var ts = parseInt(id.slice(0,-5),36);
    items.push({id:id,date:dateStr_(r[0]),type:String(r[1]),cat:String(r[2]),note:String(r[3]||''),amount:amt,created:(isFinite(ts)&&ts>1e12)?ts:(i+1),row:i+2});
  });
  return items;
}
function finanzasPost_(e){
  var lock = LockService.getScriptLock();
  try{
    lock.waitLock(25000);
    var body = JSON.parse(e.postData.contents);
    if(body.token!==TOKEN) return out_({ok:false,error:'token'});
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA);
    if(!sh) return out_({ok:false,error:'hoja'});

    // 1) borrados (solo columnas A:F, para no mover tus notas de la columna G)
    var dels = body.deletes||[];
    if(dels.length){
      var want = {}; dels.forEach(function(id){want[id]=1});
      var rows = readItems_(sh).filter(function(it){return want[it.id]}).map(function(it){return it.row}).sort(function(a,b){return b-a});
      rows.forEach(function(r){ sh.getRange(r,1,1,6).deleteCells(SpreadsheetApp.Dimension.ROWS); });
    }

    // 2) altas nuevas
    var current = readItems_(sh), seen = {};
    current.forEach(function(it){seen[it.id]=1});
    var vals = [];
    (body.rows||[]).forEach(function(r){
      if(!r||!r.id||seen[r.id]) return;
      var p = String(r.date).split('-');
      vals.push([new Date(+p[0],+p[1]-1,+p[2]), r.type, r.cat, r.note||'', Number(r.amount), 'app:'+r.id]);
      seen[r.id]=1;
    });
    if(vals.length){
      var last = sh.getLastRow(), colA = last>0 ? sh.getRange(1,1,last,1).getValues() : [], next = 2;
      for(var i=colA.length-1;i>=1;i--){ if(String(colA[i][0]).trim()!==''){ next=i+2; break; } }
      sh.getRange(next,1,vals.length,6).setValues(vals);
      sh.getRange(next,1,vals.length,1).setNumberFormat('dd/mm/yyyy');
    }

    // 3) ajustes compartidos (gana el más reciente)
    var props = PropertiesService.getScriptProperties();
    var stored = {ts:0,value:null};
    try{ stored = JSON.parse(props.getProperty('settings')||'') || stored; }catch(x){}
    var st = body.settings;
    if(st && st.value && Number(st.ts)>Number(stored.ts||0)){
      stored = {ts:Number(st.ts), value:st.value};
      props.setProperty('settings', JSON.stringify(stored));
    }

    var items = readItems_(sh).map(function(it){ delete it.row; return it; });
    return out_({ok:true, items:items, added:vals.length, settings:stored.value?stored:null});
  }catch(err){
    return out_({ok:false,error:String(err)});
  }finally{
    try{lock.releaseLock()}catch(x){}
  }
}

// ══════════ Registro de viajes (pestañas Viajes, Personas y Tarifas) ══════════
var HOJA_VIAJES = 'Viajes';
var HOJA_PERSONAS = 'Personas';
var HOJA_TARIFAS = 'Tarifas';
var TIPOS = ['redondo', 'simple', 'doble', 'triple', 'aeropuerto', 'sucursal'];

function v_cap(s){ s = String(s||''); return s.charAt(0).toUpperCase() + s.slice(1); }
function v_pad(n){ return ('0' + n).slice(-2); }


function v_dateStr(v){
  var tz = Session.getScriptTimeZone();
  if(Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  var s = String(v).trim(), m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(m) return m[1] + '-' + v_pad(m[2]) + '-' + v_pad(m[3]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if(m) return m[3] + '-' + v_pad(m[2]) + '-' + v_pad(m[1]);
  return '';
}
function v_timeStr(v){
  var m = String(v||'').trim().match(/^(\d{1,2}):(\d{2})/);
  if(!m) return '';
  var h = +m[1];
  if(/p\.?\s?m/i.test(v) && h < 12) h += 12;
  if(/a\.?\s?m/i.test(v) && h === 12) h = 0;
  return v_pad(h) + ':' + m[2];
}
function v_timeNum(s){
  var m = String(s||'').match(/^(\d{1,2}):(\d{2})$/);
  return m ? (+m[1] * 60 + +m[2]) / 1440 : '';
}
function v_amountNum(v){
  if(typeof v === 'number') return v;
  var n = Number(String(v||'').replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}
function v_names(s){
  return String(s||'').split(',').map(function(x){ return x.trim(); }).filter(function(x){ return x; });
}
function v_mondayOf(d){
  var back = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - back);
}

// Viajes: A id (t_…) · B fecha · C semana (lunes) · D tipo · E monto · F llegada · G salida · H entran · I salen · J nota
function v_readItems(sh){
  var last = sh.getLastRow(), items = [];
  if(last < 2) return items;
  var rng = sh.getRange(2, 1, last - 1, 10);
  var vals = rng.getValues(), disp = rng.getDisplayValues();
  vals.forEach(function(r, i){
    var id = String(r[0] || '').trim();
    if(id.indexOf('t_') !== 0) return;
    var date = v_dateStr(disp[i][1]) || v_dateStr(r[1]);
    if(!date) return;
    items.push({
      id: id,
      date: date,
      type: String(r[3] || '').trim().toLowerCase() || 'especial',
      amount: v_amountNum(r[4]),
      arrive: v_timeStr(disp[i][5]),
      depart: v_timeStr(disp[i][6]),
      entran: v_names(r[7]),
      salen: v_names(r[8]),
      note: String(r[9] || ''),
      row: i + 2
    });
  });
  return items;
}
function v_rowValues(r){
  var p = String(r.date).split('-');
  var d = new Date(+p[0], +p[1] - 1, +p[2]);
  return [
    String(r.id), d, v_mondayOf(d), v_cap(r.type), Number(r.amount) || 0,
    v_timeNum(r.arrive), v_timeNum(r.depart),
    (r.entran || []).join(', '), (r.salen || []).join(', '), String(r.note || '')
  ];
}
function v_writeRow(sh, row, r){
  sh.getRange(row, 8, 1, 3).setNumberFormat('@');            // texto plano: nada se interpreta como fórmula
  sh.getRange(row, 1, 1, 10).setValues([v_rowValues(r)]);
  sh.getRange(row, 2, 1, 2).setNumberFormat('yyyy-mm-dd');
  sh.getRange(row, 5).setNumberFormat('"$"#,##0');
  sh.getRange(row, 6, 1, 2).setNumberFormat('hh:mm');
}
function v_nextRow(sh){
  var last = sh.getLastRow(), colA = last > 0 ? sh.getRange(1, 1, last, 1).getValues() : [], next = 2;
  for(var i = colA.length - 1; i >= 1; i--){ if(String(colA[i][0]).trim() !== ''){ next = i + 2; break; } }
  return next;
}

function v_readSettings(ss){
  var sp = ss.getSheetByName(HOJA_PERSONAS), st = ss.getSheetByName(HOJA_TARIFAS);
  var people = [], rates = {};
  if(sp && sp.getLastRow() >= 2){
    sp.getRange(2, 1, sp.getLastRow() - 1, 1).getValues().forEach(function(r){
      var n = String(r[0] || '').trim(); if(n) people.push(n);
    });
  }
  if(st && st.getLastRow() >= 2){
    st.getRange(2, 1, st.getLastRow() - 1, 2).getValues().forEach(function(r){
      var k = String(r[0] || '').trim().toLowerCase();
      if(TIPOS.indexOf(k) > -1) rates[k] = v_amountNum(r[1]);
    });
  }
  return {people: people, rates: rates};
}
function v_writeSettings(ss, s){
  var sp = ss.getSheetByName(HOJA_PERSONAS), st = ss.getSheetByName(HOJA_TARIFAS);
  var people = (s.people || []).map(function(n){ return String(n).trim(); }).filter(function(n){ return n; });
  var lp = sp.getLastRow();
  if(lp >= 2) sp.getRange(2, 1, lp - 1, 1).clearContent();
  if(people.length){
    sp.getRange(2, 1, people.length, 1).setNumberFormat('@');
    sp.getRange(2, 1, people.length, 1).setValues(people.map(function(n){ return [n]; }));
  }
  var lt = st.getLastRow();
  if(lt >= 2) st.getRange(2, 1, lt - 1, 2).clearContent();
  var rows = TIPOS.map(function(k){ return [v_cap(k), Number((s.rates || {})[k]) || 0]; });
  st.getRange(2, 1, rows.length, 2).setValues(rows);
  st.getRange(2, 2, rows.length, 1).setNumberFormat('"$"#,##0');
}

function viajesPost_(body){
  var lock = LockService.getScriptLock();
  try{
    lock.waitLock(25000);
    if(body.token !== TOKEN) return out_({ok:false,error:'token'});
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(HOJA_VIAJES);
    if(!sh || !ss.getSheetByName(HOJA_PERSONAS) || !ss.getSheetByName(HOJA_TARIFAS)) return out_({ok:false,error:'hoja'});

    // 1) borrados (solo columnas A:J, para no mover notas que tengas más a la derecha)
    var dels = body.deletes || [];
    if(dels.length){
      var want = {}; dels.forEach(function(id){ want[id] = 1; });
      var rows = v_readItems(sh).filter(function(it){ return want[it.id]; }).map(function(it){ return it.row; }).sort(function(a, b){ return b - a; });
      rows.forEach(function(r){ sh.getRange(r, 1, 1, 10).deleteCells(SpreadsheetApp.Dimension.ROWS); });
    }

    // 2) altas y cambios (si el id ya existe se actualiza esa fila)
    var byId = {};
    v_readItems(sh).forEach(function(it){ byId[it.id] = it.row; });
    var next = v_nextRow(sh), added = 0, updated = 0;
    (body.rows || []).forEach(function(r){
      if(!r || !r.id || !r.date) return;
      if(byId[r.id]){ v_writeRow(sh, byId[r.id], r); updated++; }
      else { v_writeRow(sh, next, r); byId[r.id] = next; next++; added++; }
    });

    // 3) personas y tarifas (gana el cambio más reciente; también cuentan los cambios hechos a mano en la hoja)
    var props = PropertiesService.getScriptProperties();
    var ts = Number(props.getProperty('settings_ts') || 0);
    var s = body.settings;
    if(s && Number(s.ts) > ts){
      v_writeSettings(ss, s);
      ts = Number(s.ts);
      props.setProperty('settings_ts', String(ts));
    }
    var cfg = v_readSettings(ss);

    var items = v_readItems(sh).map(function(it){ delete it.row; return it; });
    return out_({ok:true, items:items, added:added, updated:updated, settings:{ts:ts, people:cfg.people, rates:cfg.rates}});
  }catch(err){
    return out_({ok:false,error:String(err)});
  }finally{
    try{ lock.releaseLock(); }catch(x){}
  }
}
