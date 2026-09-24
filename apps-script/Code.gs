/*** CODEK CRM - Conector de sincronizacion en la nube (v7) ***/
/*** v6 anade soporte de EQUIPO: entrenadores, asignaciones, partes. ***/
/*** v7: los leads que el CRM envía con _borrado:true se eliminan de verdad. ***/
/*** Pega este codigo COMPLETO en Apps Script (sustituye lo anterior). ***/

var TOKEN = 'codek-9fK2mP7qX4';
var CAPACIDAD = { prueba: 5, llamada: 2 };
var VENTANA_DIAS = 30;

// PINs por defecto. Si la pestaña "Entrenadores" no existe la creo con estos.
var ENTRENADORES_INICIALES = [
  { id: 't1', nombre: 'Jesús', pin: 'jesus26', activo: true },
  { id: 't2', nombre: 'Diego', pin: 'diego26', activo: true },
  { id: 't3', nombre: 'Zelai', pin: 'zelai26', activo: true },
  { id: 't4', nombre: 'Edu', pin: 'edu26', activo: true }
];

// ============================================================
//   ROUTER
// ============================================================
function doGet(e){
  e = e || {};
  var p = e.parameter || {};
  if(!p.token && !p.callback){
    return HtmlService.createHtmlOutput('<h2>CODEK CRM - backend activo</h2><p>El conector de tu CRM funciona correctamente.</p>');
  }
  var out;
  try{
    if(String(p.token) !== TOKEN){
      out = {ok:false, error:'token'};
    } else if(p.action === 'huecos' && (p.tipo === 'prueba' || p.tipo === 'llamada')){
      out = {ok:true, tipo:p.tipo, huecos:todosLosHuecos(p.tipo)};
    } else if(p.action === 'lead' && p.id){
      out = getLeadBasico_(p.id);
    } else if(p.action === 'respuesta' && p.id){
      var lock = LockService.getScriptLock();
      try{ lock.waitLock(20000); }catch(err){ out = {ok:false, error:'ocupado'}; return salida_(p, out); }
      try{ out = actualizarRespuesta({id:p.id, opcion:p.opcion}); }
      finally{ lock.releaseLock(); }
    } else if(p.action === 'reservar' && p.tipo){
      var lk = LockService.getScriptLock();
      try{ lk.waitLock(20000); }catch(err){ out = {ok:false, error:'ocupado'}; return salida_(p, out); }
      try{
        out = reservar({
          tipo: p.tipo, fecha: p.fecha, hora: p.hora,
          nombre: p.nombre, tel: p.tel, mail: p.mail, id_lead: p.id_lead
        });
      } finally{ lk.releaseLock(); }
    }
    // ----- EQUIPO -----
    else if(p.action === 'login_team' && p.pin){
      out = loginTeam_(p.pin);
    } else if(p.action === 'mis_leads' && p.id_entrenador){
      if(!validarTeam_(p.id_entrenador, p.pin||'')) out = {ok:false, error:'entrenador no valido'};
      else out = misLeads_(p.id_entrenador);
    } else if(p.action === 'detalle_lead' && p.id && p.id_entrenador){
      if(!validarTeam_(p.id_entrenador, p.pin||'')) out = {ok:false, error:'entrenador no valido'};
      else out = detalleLead_(p.id);
    } else if(p.action === 'enviar_parte' && p.id_asignacion && p.id_entrenador){
      if(!validarTeam_(p.id_entrenador, p.pin||'')) out = {ok:false, error:'entrenador no valido'};
      else {
        var lkp = LockService.getScriptLock();
        try{ lkp.waitLock(20000); }catch(err){ out = {ok:false, error:'ocupado'}; return salida_(p, out); }
        try{ out = enviarParte_(p); } finally{ lkp.releaseLock(); }
      }
    } else if(p.action === 'partes_pendientes'){
      out = partesPendientes_();
    } else if(p.action === 'aprobar_parte' && p.id_parte){
      var lkA = LockService.getScriptLock();
      try{ lkA.waitLock(20000); }catch(err){ out = {ok:false, error:'ocupado'}; return salida_(p, out); }
      try{ out = aprobarParte_(p); } finally{ lkA.releaseLock(); }
    } else if(p.action === 'rechazar_parte' && p.id_parte){
      var lkR = LockService.getScriptLock();
      try{ lkR.waitLock(20000); }catch(err){ out = {ok:false, error:'ocupado'}; return salida_(p, out); }
      try{ out = rechazarParte_(p); } finally{ lkR.releaseLock(); }
    } else if(p.action === 'asignar_lead' && p.id_lead && p.id_entrenador){
      var lkAs = LockService.getScriptLock();
      try{ lkAs.waitLock(20000); }catch(err){ out = {ok:false, error:'ocupado'}; return salida_(p, out); }
      try{ out = asignarLead_(p); } finally{ lkAs.releaseLock(); }
    } else if(p.action === 'entrenadores'){
      out = {ok:true, entrenadores:listarEntrenadoresPublico_()};
    } else if(p.action === 'asignaciones_activas'){
      out = asignacionesActivas_();
    } else if(p.action === 'historial_asignaciones'){
      out = historialAsignaciones_();
    } else if(p.action === 'descartar_asignacion' && p.id_asignacion && p.id_entrenador){
      if(!entrenadorExiste_(p.id_entrenador)) out = {ok:false, error:'entrenador no valido'};
      else {
        var lkD = LockService.getScriptLock();
        try{ lkD.waitLock(20000); }catch(err){ out = {ok:false, error:'ocupado'}; return salida_(p, out); }
        try{ out = descartarAsignacion_(p); } finally{ lkD.releaseLock(); }
      }
    } else if(p.action === 'descartar_todas' && p.id_entrenador){
      if(!entrenadorExiste_(p.id_entrenador)) out = {ok:false, error:'entrenador no valido'};
      else {
        var lkT = LockService.getScriptLock();
        try{ lkT.waitLock(20000); }catch(err){ out = {ok:false, error:'ocupado'}; return salida_(p, out); }
        try{ out = descartarTodas_(p); } finally{ lkT.releaseLock(); }
      }
    } else if(p.action === 'reagendar_asignacion' && p.id_asignacion && p.id_entrenador && p.fecha_llamada){
      if(!entrenadorExiste_(p.id_entrenador)) out = {ok:false, error:'entrenador no valido'};
      else {
        var lkR2 = LockService.getScriptLock();
        try{ lkR2.waitLock(20000); }catch(err){ out = {ok:false, error:'ocupado'}; return salida_(p, out); }
        try{ out = reagendarAsignacion_(p); } finally{ lkR2.releaseLock(); }
      }
    } else if(p.action === 'informe_entrenador' && p.id_entrenador){
      out = informeEntrenador_(p.id_entrenador, p.desde||'', p.hasta||'');
    }
    // ----- DEFAULT -----
    else {
      out = {ok:true, leads:readLeads(), plantillas:readPlantillas()};
    }
  }catch(err){ out = {ok:false, error:String(err)}; }
  return salida_(p, out);
}

function doPost(e){
  var lock = LockService.getScriptLock();
  try{ lock.waitLock(20000); }catch(err){ return salida_({}, {ok:false, error:'ocupado'}); }
  var out;
  try{
    var data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if(String(data.token) !== TOKEN){
      out = {ok:false, error:'token'};
    } else if(data.action === 'add' && data.lead){
      out = anadirLead(data.lead);
    } else if(data.action === 'respuesta' && data.id){
      out = actualizarRespuesta({id:data.id, opcion:data.opcion});
    } else if(data.action === 'reservar' && data.tipo){
      out = reservar({
        tipo: data.tipo, fecha: data.fecha, hora: data.hora,
        nombre: data.nombre, tel: data.tel, mail: data.mail, id_lead: data.id_lead
      });
    } else if(data.action === 'aprobar_parte' && data.id_parte){
      out = aprobarParte_(data);
    } else if(data.action === 'rechazar_parte' && data.id_parte){
      out = rechazarParte_(data);
    } else if(data.action === 'asignar_lead' && data.id_lead && data.id_entrenador){
      out = asignarLead_(data);
    } else {
      if(data.leads){ writeLeads(data.leads, false); }
      if(data.plantillas){ writePlantillas(data.plantillas); }
      out = {ok:true, count:(data.leads ? data.leads.length : 0)};
    }
  }catch(err){ out = {ok:false, error:String(err)}; }
  finally{ lock.releaseLock(); }
  return salida_({}, out);
}

function salida_(p, o){
  var body = JSON.stringify(o);
  if(p && p.callback){
    return ContentService.createTextOutput(p.callback + '(' + body + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
//   EQUIPO - ENTRENADORES
// ============================================================
function loginTeam_(pin){
  var ents = readEntrenadores_();
  for(var i=0;i<ents.length;i++){
    if(ents[i].activo && String(ents[i].pin) === String(pin)){
      return {ok:true, entrenador:{id:ents[i].id, nombre:ents[i].nombre, pin:ents[i].pin}};
    }
  }
  return {ok:false, error:'pin no valido'};
}

function validarTeam_(id, pin){
  // PIN opcional: si no viene, basta con que el entrenador exista y esté activo.
  var ents = readEntrenadores_();
  for(var i=0;i<ents.length;i++){
    if(!ents[i].activo) continue;
    if(String(ents[i].id) !== String(id)) continue;
    if(!pin) return true; // sin pin: aceptamos
    if(String(ents[i].pin) === String(pin)) return true;
  }
  return false;
}

function entrenadorExiste_(id){
  var ents = readEntrenadores_();
  for(var i=0;i<ents.length;i++){
    if(ents[i].activo && String(ents[i].id) === String(id)) return true;
  }
  return false;
}
function listarEntrenadoresPublico_(){
  var ents = readEntrenadores_();
  var out = [];
  for(var i=0;i<ents.length;i++){
    if(ents[i].activo) out.push({id:ents[i].id, nombre:ents[i].nombre});
  }
  return out;
}

function readEntrenadores_(){
  var s = hojaEntrenadores_();
  var data = s.getDataRange().getValues();
  var out = [];
  for(var i=1;i<data.length;i++){
    var r = data[i];
    if(!r[0]) continue;
    out.push({id:String(r[0]), nombre:String(r[1]||''), pin:String(r[2]||''), activo:r[3]!==false&&r[3]!=='false'&&r[3]!==''});
  }
  return out;
}

function hojaEntrenadores_(){
  var s = libro_().getSheetByName('Entrenadores');
  if(!s){
    s = libro_().insertSheet('Entrenadores');
    s.getRange(1,1,1,4).setValues([['id','nombre','pin','activo']]);
    var rows = ENTRENADORES_INICIALES.map(function(e){ return [e.id, e.nombre, e.pin, e.activo]; });
    s.getRange(2,1,rows.length,4).setValues(rows);
  }
  return s;
}

// ============================================================
//   EQUIPO - ASIGNACIONES (Jon -> entrenador)
// ============================================================
function asignarLead_(data){
  var id_lead = data.id_lead;
  var id_entrenador = data.id_entrenador;
  var nota = data.nota || '';
  var ents = readEntrenadores_();
  var ent = null;
  for(var i=0;i<ents.length;i++){ if(ents[i].id === id_entrenador){ ent = ents[i]; break; } }
  if(!ent) return {ok:false, error:'entrenador no existe'};

  var leads = readLeads();
  var lead = null;
  var coincidencias = 0;
  for(var j=0;j<leads.length;j++){ if(String(leads[j].id) === String(id_lead)){ if(!lead) lead = leads[j]; coincidencias++; } }
  if(!lead) return {ok:false, error:'lead no existe (id='+id_lead+')'};
  if(coincidencias > 1) return {ok:false, error:'ATENCION: hay '+coincidencias+' leads con el mismo id "'+id_lead+'". No asigno hasta arreglarlo.'};
  // Chequeo defensivo: si el frontend nos manda el nombre esperado, verificamos.
  if(data.nombre_lead_esperado){
    var esperado = String(data.nombre_lead_esperado).trim().toLowerCase();
    var real = String(lead.nombre||'').trim().toLowerCase();
    if(esperado && real && esperado !== real){
      return {ok:false, error:'Discrepancia: el CRM envió el nombre "'+data.nombre_lead_esperado+'" pero el lead con id "'+id_lead+'" se llama "'+lead.nombre+'". Refresca el CRM y reintenta.'};
    }
  }

  // IDEMPOTENCIA: si el usuario reintentó por timeout, es fácil que ya exista
  // una asignación reciente al MISMO lead+entrenador. En ese caso devolvemos la
  // existente en vez de crear otra duplicada.
  var s = hojaAsignaciones_();
  var datos = s.getDataRange().getValues();
  var ahora = Date.now();
  for(var rC=1;rC<datos.length;rC++){
    if(String(datos[rC][1]) === String(id_lead)
       && String(datos[rC][2]) === String(id_entrenador)
       && ['pendiente','en_curso'].indexOf(String(datos[rC][4]))>=0){
      // Extraer timestamp del id (formato: "a" + Date.now() + random)
      var idExistente = String(datos[rC][0]);
      var mts = idExistente.match(/^a(\d{13})/);
      if(mts){
        var ts = parseInt(mts[1],10);
        if(ahora - ts < 120000){ // <2 min = probablemente reintento
          // Actualizar fecha_llamada y nota por si el usuario las cambió en el reintento
          if(data.fecha_llamada) s.getRange(rC+1, 9).setNumberFormat('@').setValue(data.fecha_llamada);
          if(nota) s.getRange(rC+1, 4).setValue(nota);
          return {ok:true, id_asignacion:idExistente, duplicado_evitado:true};
        }
      }
    }
  }

  // Cancelar asignaciones previas vivas del mismo lead (solo una activa por lead)
  for(var r=1;r<datos.length;r++){
    if(String(datos[r][1]) === String(id_lead) && ['pendiente','en_curso'].indexOf(String(datos[r][4]))>=0){
      s.getRange(r+1, 5).setValue('reemplazada');
    }
  }

  var idAsig = 'a' + Date.now() + Math.floor(Math.random()*1000);
  var creadoEn = fechaHoraMadrid();
  var fechaLlamada = data.fecha_llamada || '';
  var nextRow = s.getLastRow() + 1;
  s.getRange(nextRow, 1, 1, 9).setNumberFormat('@').setValues([[idAsig, id_lead, id_entrenador, nota, 'pendiente', creadoEn, lead.nombre||'', lead.tel||'', fechaLlamada]]);

  return {ok:true, id_asignacion:idAsig};
}

function misLeads_(id_entrenador){
  var asigns = readAsignaciones_();
  var leads = readLeads();
  var leadsById = {};
  for(var i=0;i<leads.length;i++) leadsById[String(leads[i].id)] = leads[i];

  // Cuáles tienen parte ya enviado (para mostrar el badge correcto)
  var partes = readPartes_();
  var asigCon = {};
  for(var p=0;p<partes.length;p++){
    if(['pendiente','aprobado','rechazado'].indexOf(partes[p].estado)>=0){
      asigCon[partes[p].id_asignacion] = partes[p];
    }
  }

  var out = [];
  for(var k=0;k<asigns.length;k++){
    var a = asigns[k];
    if(a.id_entrenador !== id_entrenador) continue;
    if(['pendiente','en_curso','con_parte'].indexOf(a.estado)<0) continue;
    var L = leadsById[String(a.id_lead)];
    if(!L) continue;
    var parte = asigCon[a.id];
    out.push({
      id_asignacion: a.id,
      id_lead: a.id_lead,
      nombre: L.nombre || '',
      tel: L.tel || '',
      mail: L.mail || '',
      interes: L.interes || '',
      procedencia: L.procedencia || '',
      estado: L.estado || '',
      nota_lead: L.nota || '',
      fecha_gestion: L.fechaGestion || '',
      ultimo_contacto: L.ultimoContacto || '',
      llamadas_hechas: L.llamadasHechas || 0,
      prox_fecha: L.proxFecha || '',
      prox_hora: L.proxHora || '',
      prox_tipo: L.proxTipo || '',
      prox_nota: L.proxNota || '',
      prox_franja: L.proxFranja || '',
      fecha_visita: L.fechaVisita || '',
      hora_visita: L.horaVisita || '',
      mensaje_enviado_en: L.mensajeEnviadoEn || '',
      respuesta_encuesta: L.respuestaEncuesta || '',
      respuesta_fecha: L.respuestaFecha || '',
      nota_jon: a.nota || '',
      creadoEn: a.creadoEn,
      fecha_llamada: a.fecha_llamada || '',
      estado_asig: a.estado,
      con_parte: !!parte,
      parte_estado: parte ? parte.estado : null,
      parte_rechazo: (parte && parte.estado==='rechazado') ? (parte.nota_jon||'') : null
    });
  }
  out.sort(function(x,y){ return x.creadoEn>y.creadoEn?-1:1; });
  return {ok:true, leads:out};
}

function detalleLead_(id_lead){
  var leads = readLeads();
  for(var i=0;i<leads.length;i++){
    if(String(leads[i].id) === String(id_lead)){
      return {ok:true, lead:leads[i]};
    }
  }
  return {ok:false, error:'no encontrado'};
}

// Informe por entrenador: stats + lista de partes en el rango [desde, hasta] (inclusivos)
// Si no se pasa desde/hasta, devuelve TODO lo del entrenador.
function informeEntrenador_(id_entrenador, desde, hasta){
  var partes = readPartes_();
  var leads = readLeads();
  var leadsById = {};
  for(var i=0;i<leads.length;i++) leadsById[String(leads[i].id)] = leads[i];
  var stats = {total:0, cogio:0, no_cogio:0, buzon:0, apagado:0};
  var lista = [];
  for(var k=0;k<partes.length;k++){
    var p = partes[k];
    if(p.id_entrenador !== id_entrenador) continue;
    var dia = (p.creadoEn||'').substring(0,10);
    if(desde && dia < desde) continue;
    if(hasta && dia > hasta) continue;
    stats.total++;
    if(stats.hasOwnProperty(p.resultado)) stats[p.resultado]++;
    var L = leadsById[String(p.id_lead)] || {};
    lista.push({
      id_parte: p.id,
      id_lead: p.id_lead,
      lead_nombre: L.nombre || '(sin nombre)',
      lead_tel: L.tel || '',
      resultado: p.resultado,
      nota_entrenador: p.nota_entrenador,
      estado_parte: p.estado,
      creadoEn: p.creadoEn,
      propuesta_estado: p.propuesta_estado,
      propuesta_prox_fecha: p.propuesta_prox_fecha,
      propuesta_prox_tipo: p.propuesta_prox_tipo
    });
  }
  // Más recientes arriba
  lista.sort(function(x,y){ return x.creadoEn>y.creadoEn?-1:1; });
  return {ok:true, stats:stats, partes:lista};
}

// Devuelve TODAS las asignaciones agrupadas por id_lead, ordenadas por creadoEn.
// Cada asignación incluye estado + nombre del entrenador para que el CRM pueda
// mostrar chips (los activos normales, los pasados tachados).
function historialAsignaciones_(){
  var asigns = readAsignaciones_();
  var ents = readEntrenadores_();
  var entsById = {};
  for(var i=0;i<ents.length;i++) entsById[ents[i].id] = ents[i];
  var mapa = {};
  for(var k=0;k<asigns.length;k++){
    var a = asigns[k];
    var E = entsById[a.id_entrenador] || {};
    if(!mapa[a.id_lead]) mapa[a.id_lead] = [];
    mapa[a.id_lead].push({
      id_asignacion: a.id,
      id_entrenador: a.id_entrenador,
      nombre_entrenador: E.nombre || a.id_entrenador,
      estado: a.estado,
      creadoEn: a.creadoEn,
      fecha_llamada: a.fecha_llamada || ''
    });
  }
  // Ordenar cada lista por creadoEn (más reciente primero)
  Object.keys(mapa).forEach(function(id){
    mapa[id].sort(function(a,b){ return a.creadoEn>b.creadoEn?-1:1; });
  });
  return {ok:true, historial:mapa};
}

function asignacionesActivas_(){
  var asigns = readAsignaciones_();
  var ents = readEntrenadores_();
  var entsById = {};
  for(var i=0;i<ents.length;i++) entsById[ents[i].id] = ents[i];
  var ACTIVOS = {pendiente:1, en_curso:1, con_parte:1};
  var out = [];
  for(var k=0;k<asigns.length;k++){
    var a = asigns[k];
    if(!ACTIVOS[a.estado]) continue;
    var E = entsById[a.id_entrenador] || {};
    out.push({
      id_asignacion: a.id,
      id_lead: a.id_lead,
      id_entrenador: a.id_entrenador,
      nombre_entrenador: E.nombre || a.id_entrenador,
      estado: a.estado,
      nota: a.nota,
      creadoEn: a.creadoEn,
      fecha_llamada: a.fecha_llamada || ''
    });
  }
  return {ok:true, asignaciones:out};
}

function descartarAsignacion_(data){
  var s = hojaAsignaciones_();
  var datos = s.getDataRange().getValues();
  for(var r=1;r<datos.length;r++){
    if(String(datos[r][0]) === String(data.id_asignacion)){
      if(String(datos[r][2]) !== String(data.id_entrenador)) return {ok:false, error:'no es tu asignacion'};
      if(['pendiente','en_curso','con_parte'].indexOf(String(datos[r][4]))<0) return {ok:false, error:'ya no esta activa'};
      s.getRange(r+1, 5).setValue('descartada');
      return {ok:true, id_asignacion:data.id_asignacion};
    }
  }
  return {ok:false, error:'asignacion no encontrada'};
}

function reagendarAsignacion_(data){
  var s = hojaAsignaciones_();
  var datos = s.getDataRange().getValues();
  for(var r=1;r<datos.length;r++){
    if(String(datos[r][0]) === String(data.id_asignacion)){
      if(String(datos[r][2]) !== String(data.id_entrenador)) return {ok:false, error:'no es tu asignacion'};
      if(['pendiente','en_curso','con_parte'].indexOf(String(datos[r][4]))<0) return {ok:false, error:'ya no esta activa'};
      // Escribir la fecha nueva en la columna 9 forzando texto puro
      s.getRange(r+1, 9).setNumberFormat('@').setValue(data.fecha_llamada);
      // Añadir nota opcional al final de la nota existente si viene
      if(data.nota_extra){
        var notaVieja = String(datos[r][3]||'');
        var separador = notaVieja ? ' · ' : '';
        s.getRange(r+1, 4).setValue(notaVieja + separador + '[Reagendado por entrenador: ' + data.nota_extra + ']');
      }
      return {ok:true, id_asignacion:data.id_asignacion, fecha_llamada:data.fecha_llamada};
    }
  }
  return {ok:false, error:'asignacion no encontrada'};
}

function descartarTodas_(data){
  var s = hojaAsignaciones_();
  var datos = s.getDataRange().getValues();
  var n = 0;
  for(var r=1;r<datos.length;r++){
    if(String(datos[r][2]) === String(data.id_entrenador)
       && ['pendiente','en_curso','con_parte'].indexOf(String(datos[r][4]))>=0){
      s.getRange(r+1, 5).setValue('descartada');
      n++;
    }
  }
  return {ok:true, descartadas:n};
}

// Convierte lo que sea (Date, string ISO, string con hora, "") a "yyyy-MM-dd" zona Madrid
function normalizarFecha_(v){
  if(!v && v!==0) return '';
  if(v instanceof Date){
    return Utilities.formatDate(v, 'Europe/Madrid', 'yyyy-MM-dd');
  }
  var s = String(v).trim();
  if(!s) return '';
  // Ya viene en formato yyyy-MM-dd
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // yyyy-MM-ddTHH:MM:SS o "yyyy-MM-dd HH:MM"
  var m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if(m) return m[1];
  // Como último recurso intento parseo Date
  var d = new Date(s);
  if(!isNaN(d)) return Utilities.formatDate(d, 'Europe/Madrid', 'yyyy-MM-dd');
  return '';
}

function readAsignaciones_(){
  var s = hojaAsignaciones_();
  var data = s.getDataRange().getValues();
  var out = [];
  for(var i=1;i<data.length;i++){
    var r = data[i];
    if(!r[0]) continue;
    out.push({id:String(r[0]), id_lead:String(r[1]), id_entrenador:String(r[2]), nota:String(r[3]||''), estado:String(r[4]||''), creadoEn:String(r[5]||''), nombre:String(r[6]||''), tel:String(r[7]||''), fecha_llamada:normalizarFecha_(r[8])});
  }
  return out;
}

function hojaAsignaciones_(){
  var s = libro_().getSheetByName('Asignaciones');
  if(!s){
    s = libro_().insertSheet('Asignaciones');
    s.getRange(1,1,1,9).setValues([['id','id_lead','id_entrenador','nota','estado','creadoEn','nombre_cache','tel_cache','fecha_llamada']]);
  }
  return s;
}

// ============================================================
//   EQUIPO - PARTES (entrenador -> Jon)
// ============================================================
function enviarParte_(data){
  var id_asig = data.id_asignacion;
  // Datos del parte
  var resultado = data.resultado || ''; // cogio | no_cogio | buzon | apagado
  // Mantenemos compat: si llega 'ocupado' (versión vieja del front), tratarlo como apagado
  if(resultado === 'ocupado') resultado = 'apagado';
  if(['cogio','no_cogio','buzon','apagado'].indexOf(resultado) < 0) return {ok:false, error:'resultado no valido'};

  var asigns = readAsignaciones_();
  var asig = null;
  for(var i=0;i<asigns.length;i++){ if(asigns[i].id === id_asig){ asig = asigns[i]; break; } }
  if(!asig) return {ok:false, error:'asignacion no encontrada'};
  if(asig.id_entrenador !== data.id_entrenador) return {ok:false, error:'no es tu asignacion'};

  // Empaquetar el parte
  var parte = {
    id: 'pa' + Date.now() + Math.floor(Math.random()*1000),
    id_asignacion: id_asig,
    id_lead: asig.id_lead,
    id_entrenador: data.id_entrenador,
    resultado: resultado,
    nota_entrenador: data.nota_entrenador || '',
    propuesta_estado: data.propuesta_estado || '',
    propuesta_prox_fecha: data.propuesta_prox_fecha || '',
    propuesta_prox_hora: data.propuesta_prox_hora || '',
    propuesta_prox_tipo: data.propuesta_prox_tipo || '',
    propuesta_prox_nota: data.propuesta_prox_nota || '',
    propuesta_visita_fecha: data.propuesta_visita_fecha || '',
    propuesta_visita_hora: data.propuesta_visita_hora || '',
    sugerir_wa: data.sugerir_wa === 'true' || data.sugerir_wa === true,
    texto_wa: data.texto_wa || '',
    estado: 'pendiente',
    creadoEn: fechaHoraMadrid(),
    revisadoEn: '',
    nota_jon: ''
  };

  var s = hojaPartes_();
  s.appendRow([
    parte.id, parte.id_asignacion, parte.id_lead, parte.id_entrenador,
    parte.resultado, parte.nota_entrenador, parte.propuesta_estado,
    parte.propuesta_prox_fecha, parte.propuesta_prox_hora, parte.propuesta_prox_tipo, parte.propuesta_prox_nota,
    parte.propuesta_visita_fecha, parte.propuesta_visita_hora,
    parte.sugerir_wa?'true':'false', parte.texto_wa,
    parte.estado, parte.creadoEn, parte.revisadoEn, parte.nota_jon
  ]);

  // Marcar asignacion como con_parte
  var sa = hojaAsignaciones_();
  var dd = sa.getDataRange().getValues();
  for(var r=1;r<dd.length;r++){ if(String(dd[r][0]) === id_asig){ sa.getRange(r+1, 5).setValue('con_parte'); break; } }

  return {ok:true, id_parte:parte.id};
}

function partesPendientes_(){
  var partes = readPartes_();
  var leads = readLeads();
  var leadsById = {};
  for(var i=0;i<leads.length;i++) leadsById[String(leads[i].id)] = leads[i];
  var ents = readEntrenadores_();
  var entsById = {};
  for(var j=0;j<ents.length;j++) entsById[ents[j].id] = ents[j];

  var out = [];
  for(var k=0;k<partes.length;k++){
    if(partes[k].estado !== 'pendiente') continue;
    var L = leadsById[String(partes[k].id_lead)] || {};
    var E = entsById[partes[k].id_entrenador] || {};
    out.push({
      id_parte: partes[k].id,
      id_asignacion: partes[k].id_asignacion,
      id_lead: partes[k].id_lead,
      lead_nombre: L.nombre||'(sin nombre)',
      lead_tel: L.tel||'',
      lead_estado: L.estado||'',
      entrenador_nombre: E.nombre||partes[k].id_entrenador,
      resultado: partes[k].resultado,
      nota_entrenador: partes[k].nota_entrenador,
      propuesta_estado: partes[k].propuesta_estado,
      propuesta_prox_fecha: partes[k].propuesta_prox_fecha,
      propuesta_prox_hora: partes[k].propuesta_prox_hora,
      propuesta_prox_tipo: partes[k].propuesta_prox_tipo,
      propuesta_prox_nota: partes[k].propuesta_prox_nota,
      propuesta_visita_fecha: partes[k].propuesta_visita_fecha,
      propuesta_visita_hora: partes[k].propuesta_visita_hora,
      sugerir_wa: partes[k].sugerir_wa,
      texto_wa: partes[k].texto_wa,
      creadoEn: partes[k].creadoEn
    });
  }
  out.sort(function(x,y){ return x.creadoEn>y.creadoEn?-1:1; });
  return {ok:true, partes:out};
}

function aprobarParte_(data){
  var id_parte = data.id_parte;
  var partes = readPartes_();
  var idx = -1;
  for(var i=0;i<partes.length;i++){ if(partes[i].id === id_parte){ idx = i; break; } }
  if(idx === -1) return {ok:false, error:'parte no encontrado'};
  if(partes[idx].estado !== 'pendiente') return {ok:false, error:'ya gestionado'};

  // Permitir override desde Jon ("editar y aprobar")
  var P = partes[idx];
  var overrides = data.overrides || {};
  ['propuesta_estado','propuesta_prox_fecha','propuesta_prox_hora','propuesta_prox_tipo','propuesta_prox_nota','propuesta_visita_fecha','propuesta_visita_hora'].forEach(function(k){
    if(typeof overrides[k] !== 'undefined') P[k] = overrides[k];
  });

  // Aplicar al lead
  var leads = readLeads();
  var li = -1;
  for(var j=0;j<leads.length;j++){ if(String(leads[j].id) === String(P.id_lead)){ li = j; break; } }
  if(li === -1) return {ok:false, error:'lead no encontrado'};

  var L = leads[li];
  var hoy = hoyMadrid();
  var fechaHora = fechaHoraMadrid();

  var resTxt = (P.resultado === 'cogio' ? 'Cogió' : (P.resultado === 'no_cogio' ? 'No cogió' : (P.resultado === 'buzon' ? 'Buzón' : 'Apagado')));
  // Formato nuevo: resultado primero, luego entrenador, luego fecha. Lo importante a la vista.
  var nota = '👤 ' + resTxt + ' · ' + nombreEntrenador_(P.id_entrenador) + ' · ' + fechaHora;
  if(P.nota_entrenador) nota += ' — ' + P.nota_entrenador;

  // Contador histórico TOTAL de intentos de llamada (sube siempre, sin importar el resultado)
  L.llamadasTotales = (parseInt(L.llamadasTotales||0,10)||0) + 1;

  if(P.propuesta_estado){ L.estado = P.propuesta_estado; }
  if(P.propuesta_visita_fecha){ L.fechaVisita = P.propuesta_visita_fecha; }
  if(P.propuesta_visita_hora){ L.horaVisita = P.propuesta_visita_hora; }
  // Si el resultado NO es "cogio" y no hay propuesta manual, reagenda automáticamente:
  //   - Si ahora es por la mañana (<14h) -> tarde de hoy
  //   - Si ahora es por la tarde -> mañana de mañana
  var esNoCogio = (P.resultado === 'no_cogio' || P.resultado === 'buzon' || P.resultado === 'apagado');
  if(esNoCogio && !P.propuesta_prox_fecha){
    var horaActual = parseInt(horaMadrid().substring(0,2),10);
    if(horaActual < 14){
      L.proxFecha = hoy;
      L.proxFranja = 'tarde';
    } else {
      L.proxFecha = sumarDias_(hoy, 1);
      L.proxFranja = 'manana';
    }
    L.proxHora = '';
    L.proxTipo = 'llamada';
    var lblRes = (P.resultado==='buzon'?'buzón':(P.resultado==='apagado'?'apagado':'no cogió'));
    L.proxNota = 'Reintento tras '+lblRes+' de '+nombreEntrenador_(P.id_entrenador);
    L.rezagado = false;
  } else if(P.propuesta_prox_fecha){
    L.proxFecha = P.propuesta_prox_fecha;
    L.proxHora = P.propuesta_prox_hora || '';
    L.proxTipo = P.propuesta_prox_tipo || 'llamada';
    L.proxNota = P.propuesta_prox_nota || '';
    var hh = parseInt((P.propuesta_prox_hora||'09:00').substring(0,2),10);
    L.proxFranja = hh<14?'manana':'tarde';
    L.llamadasHechas = 0; L.rezagado = false;
  } else if(P.sugerir_wa && P.texto_wa) {
    // Sugirió que Jon mande WA pero no reagendó: agendar un mensaje pendiente para HOY
    L.proxFecha = hoy;
    L.proxHora = '';
    L.proxTipo = 'mensaje';
    L.proxNota = 'Mensaje sugerido por ' + nombreEntrenador_(P.id_entrenador) + ': ' + String(P.texto_wa).substring(0, 140);
    L.proxFranja = 'manana';
    L.llamadasHechas = 0; L.rezagado = false;
  } else if(P.resultado === 'cogio') {
    // si cogió y no se reagenda ni hay WA sugerido, limpiamos próximo contacto
    L.proxFecha = ''; L.proxHora=''; L.proxTipo=''; L.proxNota='';
    L.llamadasHechas = 0;
  }

  L.nota = (L.nota?L.nota+'\n':'') + nota;
  L.ultimoContacto = hoy;
  // OPTIMIZACIÓN: actualizar solo la fila del lead, no todo el sheet
  actualizarLeadEnSheet_(L);

  // Marcar parte y asignacion
  var sp = hojaPartes_();
  var dp = sp.getDataRange().getValues();
  for(var r=1;r<dp.length;r++){
    if(String(dp[r][0]) === id_parte){
      sp.getRange(r+1, 16).setValue('aprobado');
      sp.getRange(r+1, 18).setValue(fechaHora);
      if(data.nota_jon) sp.getRange(r+1, 19).setValue(data.nota_jon);
      break;
    }
  }
  var sa = hojaAsignaciones_();
  var da = sa.getDataRange().getValues();
  for(var rr=1;rr<da.length;rr++){
    if(String(da[rr][0]) === P.id_asignacion){ sa.getRange(rr+1, 5).setValue('completado'); break; }
  }

  // Devolvemos también el lead actualizado para que el CRM lo aplique sin re-fetch
  return {ok:true, sugerir_wa: P.sugerir_wa, texto_wa: P.texto_wa, id_lead: P.id_lead, lead: L};
}

function rechazarParte_(data){
  var id_parte = data.id_parte;
  var motivo = data.motivo || '';
  var sp = hojaPartes_();
  var dp = sp.getDataRange().getValues();
  for(var r=1;r<dp.length;r++){
    if(String(dp[r][0]) === id_parte){
      if(String(dp[r][15]) !== 'pendiente') return {ok:false, error:'ya gestionado'};
      sp.getRange(r+1, 16).setValue('rechazado');
      sp.getRange(r+1, 18).setValue(fechaHoraMadrid());
      sp.getRange(r+1, 19).setValue(motivo);
      // La asignacion vuelve a "pendiente" para que el entrenador pueda corregir
      var sa = hojaAsignaciones_();
      var da = sa.getDataRange().getValues();
      for(var rr=1;rr<da.length;rr++){
        if(String(da[rr][0]) === String(dp[r][1])){ sa.getRange(rr+1, 5).setValue('pendiente'); break; }
      }
      return {ok:true};
    }
  }
  return {ok:false, error:'parte no encontrado'};
}

function nombreEntrenador_(id){
  var ents = readEntrenadores_();
  for(var i=0;i<ents.length;i++){ if(ents[i].id === id) return ents[i].nombre; }
  return id;
}

function _fechaTxt_(v){
  // Convierte el valor de la celda a string yyyy-MM-dd HH:mm en zona Madrid,
  // aceptando Date object (autodetectado por Sheets) o ya-string.
  if(!v && v!==0) return '';
  if(v instanceof Date) return Utilities.formatDate(v, 'Europe/Madrid', 'yyyy-MM-dd HH:mm');
  return String(v);
}
function _fechaSoloDia_(v){
  if(!v && v!==0) return '';
  if(v instanceof Date) return Utilities.formatDate(v, 'Europe/Madrid', 'yyyy-MM-dd');
  var s = String(v);
  return s.substring(0,10);
}
function readPartes_(){
  var s = hojaPartes_();
  var data = s.getDataRange().getValues();
  var out = [];
  for(var i=1;i<data.length;i++){
    var r = data[i];
    if(!r[0]) continue;
    out.push({
      id:String(r[0]), id_asignacion:String(r[1]), id_lead:String(r[2]), id_entrenador:String(r[3]),
      resultado:String(r[4]||''), nota_entrenador:String(r[5]||''), propuesta_estado:String(r[6]||''),
      propuesta_prox_fecha:_fechaSoloDia_(r[7]), propuesta_prox_hora:String(r[8]||''),
      propuesta_prox_tipo:String(r[9]||''), propuesta_prox_nota:String(r[10]||''),
      propuesta_visita_fecha:_fechaSoloDia_(r[11]), propuesta_visita_hora:String(r[12]||''),
      sugerir_wa:String(r[13])==='true', texto_wa:String(r[14]||''),
      estado:String(r[15]||''), creadoEn:_fechaTxt_(r[16]), revisadoEn:_fechaTxt_(r[17]), nota_jon:String(r[18]||'')
    });
  }
  return out;
}

function hojaPartes_(){
  var s = libro_().getSheetByName('Partes');
  if(!s){
    s = libro_().insertSheet('Partes');
    s.getRange(1,1,1,19).setValues([[
      'id','id_asignacion','id_lead','id_entrenador',
      'resultado','nota_entrenador','propuesta_estado',
      'propuesta_prox_fecha','propuesta_prox_hora','propuesta_prox_tipo','propuesta_prox_nota',
      'propuesta_visita_fecha','propuesta_visita_hora',
      'sugerir_wa','texto_wa',
      'estado','creadoEn','revisadoEn','nota_jon'
    ]]);
  }
  return s;
}

// ============================================================
//   GET LEAD BASICO (para autocompletar formulario de reserva)
// ============================================================
function getLeadBasico_(id){
  var leads = readLeads();
  for(var i=0;i<leads.length;i++){
    if(String(leads[i].id) === String(id)){
      var l = leads[i];
      return {ok:true, lead:{nombre:l.nombre||'', tel:l.tel||'', mail:l.mail||''}};
    }
  }
  return {ok:false, error:'lead no encontrado'};
}

// ============================================================
//   UTILIDADES DE FECHA / HORA (zona Madrid)
// ============================================================
function pad2(n){ return ('0'+n).slice(-2); }
function hoyMadrid(){ return Utilities.formatDate(new Date(),'Europe/Madrid','yyyy-MM-dd'); }
function horaMadrid(){ return Utilities.formatDate(new Date(),'Europe/Madrid','HH:mm'); }
function fechaHoraMadrid(){ return Utilities.formatDate(new Date(),'Europe/Madrid','yyyy-MM-dd HH:mm'); }
function sumarDias_(fechaISO, n){
  var d = new Date(fechaISO + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return Utilities.formatDate(d,'Europe/Madrid','yyyy-MM-dd');
}
function soloDigitos_(t){ return String(t || '').replace(/[^0-9]/g, ''); }

// ============================================================
//   RESERVAS - Slots disponibles por dia
// ============================================================
function slotsDeDia_(tipo, fechaISO){
  var d = new Date(fechaISO + 'T12:00:00');
  var dia = d.getDay();
  var slots = [];
  if(tipo === 'prueba'){
    if(dia >= 1 && dia <= 5){
      for(var h=8; h<=20; h++) slots.push(pad2(h)+':00');
    } else if(dia === 6){
      slots.push('10:00','11:00');
    }
  } else if(tipo === 'llamada'){
    for(var hh=9; hh<=21; hh++){
      slots.push(pad2(hh)+':00');
      slots.push(pad2(hh)+':30');
    }
  }
  return slots;
}

function todosLosHuecos(tipo){
  var hoy = hoyMadrid();
  var horaAhora = horaMadrid();
  var reservas = readReservas_();
  var conteo = {};
  reservas.forEach(function(r){
    if(r.estado !== 'cancelado' && r.tipo === tipo){
      var k = r.fecha + ' ' + r.hora;
      conteo[k] = (conteo[k] || 0) + 1;
    }
  });
  var capacidad = CAPACIDAD[tipo] || 0;
  var huecos = [];
  for(var i=0; i<=VENTANA_DIAS; i++){
    var fecha = sumarDias_(hoy, i);
    var slots = slotsDeDia_(tipo, fecha);
    for(var s=0; s<slots.length; s++){
      var hora = slots[s];
      if(fecha === hoy && hora <= horaAhora) continue;
      var key = fecha + ' ' + hora;
      var ocupadas = conteo[key] || 0;
      var libres = capacidad - ocupadas;
      if(libres > 0){
        huecos.push({fecha:fecha, hora:hora, plazas_libres:libres, plazas_total:capacidad});
      }
    }
  }
  return huecos;
}

// ============================================================
//   RESERVAR
// ============================================================
function reservar(data){
  if(!data || !data.tipo || !data.fecha || !data.hora) return {ok:false, error:'datos incompletos'};
  if(data.tipo !== 'prueba' && data.tipo !== 'llamada') return {ok:false, error:'tipo invalido'};
  var slotsValidos = slotsDeDia_(data.tipo, data.fecha);
  if(slotsValidos.indexOf(data.hora) === -1) return {ok:false, error:'hora no valida para ese dia'};
  if(data.fecha < hoyMadrid() || (data.fecha === hoyMadrid() && data.hora <= horaMadrid())){
    return {ok:false, error:'no se puede reservar en el pasado'};
  }
  if(!data.tel || soloDigitos_(data.tel).length < 9) return {ok:false, error:'telefono no valido'};

  var reservas = readReservas_();
  var ocupadas = 0;
  reservas.forEach(function(r){
    if(r.estado !== 'cancelado' && r.tipo === data.tipo && r.fecha === data.fecha && r.hora === data.hora) ocupadas++;
  });
  if(ocupadas >= CAPACIDAD[data.tipo]) return {ok:false, error:'sin plazas'};

  var idReserva = 'r' + Date.now() + Math.floor(Math.random()*1000);
  var creadoEn = fechaHoraMadrid();
  var s = hojaReservas_();
  s.appendRow([
    idReserva, data.tipo, data.fecha, data.hora,
    data.nombre || '', data.tel || '', data.mail || '',
    data.id_lead || '', creadoEn, 'activo'
  ]);
  actualizarLeadDesdeReserva_(data, idReserva, creadoEn);
  return {ok:true, id_reserva:idReserva, fecha:data.fecha, hora:data.hora, tipo:data.tipo};
}

function actualizarLeadDesdeReserva_(data, idReserva, creadoEn){
  var leads = readLeads();
  var idx = -1;
  if(data.id_lead){
    for(var i=0;i<leads.length;i++){ if(String(leads[i].id) === String(data.id_lead)){idx=i; break;} }
  }
  if(idx === -1 && data.tel){
    var t9 = soloDigitos_(data.tel).slice(-9);
    if(t9){
      for(var j=0;j<leads.length;j++){
        if(soloDigitos_(leads[j].tel).slice(-9) === t9){idx=j; break;}
      }
    }
  }
  var hoy = hoyMadrid();
  var hh = parseInt(data.hora.substring(0,2), 10);
  var franja = (hh < 14) ? 'manana' : 'tarde';
  var nota;
  if(data.tipo === 'prueba'){
    nota = '📅 ' + creadoEn + ' · RESERVÓ CLASE DE PRUEBA para ' + data.fecha + ' a las ' + data.hora;
  } else {
    nota = '📞 ' + creadoEn + ' · RESERVÓ LLAMADA para ' + data.fecha + ' a las ' + data.hora;
  }
  if(idx === -1){
    var nuevoLead = {
      id: 'res_' + idReserva, nombre: data.nombre || '', tel: data.tel || '', mail: data.mail || '',
      procedencia: 'Web', interes: 'Sin definir',
      estado: data.tipo === 'prueba' ? 'E5' : 'E4',
      nota: nota, fechaGestion: hoy,
      fechaVisita: data.tipo === 'prueba' ? data.fecha : '',
      horaVisita: data.tipo === 'prueba' ? data.hora : '',
      ultimoContacto: '', creadoEn: new Date().toISOString(),
      llamar: false, llamarResultado: '',
      proxFecha: data.tipo === 'llamada' ? data.fecha : '',
      proxHora: data.tipo === 'llamada' ? data.hora : '',
      proxTipo: data.tipo === 'llamada' ? 'llamada' : '',
      proxFranja: data.tipo === 'llamada' ? franja : '',
      proxNota: data.tipo === 'llamada' ? 'Reservó llamada vía calendario web' : '',
      llamadasHechas: 0, rezagado: false
    };
    leads.push(nuevoLead);
  } else {
    var l = leads[idx];
    if(data.tipo === 'prueba'){
      l.estado = 'E5'; l.fechaVisita = data.fecha; l.horaVisita = data.hora;
    } else {
      l.estado = 'E4'; l.proxFecha = data.fecha; l.proxHora = data.hora;
      l.proxTipo = 'llamada'; l.proxFranja = franja;
      l.proxNota = 'Reservó llamada vía calendario web';
      l.llamadasHechas = 0; l.rezagado = false;
    }
    l.nota = (l.nota?l.nota+'\n':'') + nota;
    l.ultimoContacto = hoy;
    if(data.nombre && !l.nombre) l.nombre = data.nombre;
    if(data.mail && !l.mail) l.mail = data.mail;
    leads[idx] = l;
  }
  // OPTIMIZACIÓN: solo escribir el lead modificado o nuevo.
  var leadAEscribir = (idx === -1) ? leads[leads.length-1] : leads[idx];
  actualizarLeadEnSheet_(leadAEscribir);
}

function readReservas_(){
  var s = hojaReservas_();
  var data = s.getDataRange().getValues();
  var out = [];
  for(var i=1;i<data.length;i++){
    var row = data[i];
    if(!row[0]) continue;
    out.push({
      id: row[0], tipo: row[1], fecha: row[2], hora: row[3],
      nombre: row[4], tel: row[5], mail: row[6], id_lead: row[7],
      creadoEn: row[8], estado: row[9]
    });
  }
  return out;
}

function hojaReservas_(){
  var s = libro_().getSheetByName('Reservas');
  if(!s){
    s = libro_().insertSheet('Reservas');
    s.getRange(1,1,1,10).setNumberFormat('@').setValues([['id','tipo','fecha','hora','nombre','tel','mail','id_lead','creadoEn','estado']]);
  }
  return s;
}

// ============================================================
//   RESPUESTA del formulario rapido (v3 - mantenido)
// ============================================================
function actualizarRespuesta(data){
  if(!data || !data.id || !data.opcion) return {ok:false, error:'datos incompletos'};
  var leads = readLeads();
  var idx = -1;
  for(var i=0;i<leads.length;i++){
    if(String(leads[i].id) === String(data.id)){ idx = i; break; }
  }
  if(idx === -1) return {ok:false, error:'lead no encontrado'};
  var l = leads[idx];
  var fechaHora = fechaHoraMadrid();
  var hoy = fechaHora.substring(0, 10);
  var hora = parseInt(fechaHora.substring(11, 13), 10);
  var franja = (hora < 14) ? 'manana' : 'tarde';
  var nota;
  switch(data.opcion){
    case 'llamar':
      l.estado='E2'; l.proxFecha=hoy; l.proxTipo='llamada'; l.proxFranja=franja;
      l.proxNota='Ha pedido que le llamemos (formulario WA)';
      nota = '✅ ' + fechaHora + ' · Respondió: QUIERE QUE LE LLAMEMOS'; break;
    case 'reservar':
      l.estado='E4'; l.proxFecha=hoy; l.proxTipo='llamada'; l.proxFranja=franja;
      l.proxNota='Quiere reservar clase de prueba — llamar para cerrar día/hora';
      nota = '✅ ' + fechaHora + ' · Respondió: QUIERE RESERVAR CLASE DE PRUEBA'; break;
    case 'info':
      l.estado='E2'; l.proxFecha=hoy; l.proxTipo='mensaje';
      l.proxNota='Pide más información detallada por WhatsApp';
      nota = '✅ ' + fechaHora + ' · Respondió: PIDE MÁS INFO POR WHATSAPP'; break;
    default: return {ok:false, error:'opcion no valida'};
  }
  l.respuestaEncuesta = data.opcion;
  l.respuestaFecha = fechaHora;
  l.nota = (l.nota?l.nota+'\n':'') + nota;
  l.ultimoContacto = hoy;
  l.llamadasHechas = 0; l.rezagado = false;
  l.llamar = false; l.llamarResultado = '';
  leads[idx] = l;
  actualizarLeadEnSheet_(l); // OPTIMIZACIÓN: solo una fila
  return {ok:true, opcion:data.opcion};
}

// ============================================================
//   ANADIR LEAD (Make / FB Lead Ads)
// ============================================================
function anadirLead(lead){
  var leads = readLeads();
  var telNuevo = soloDigitos_(lead.tel).slice(-9);
  if(telNuevo){
    for(var i=0;i<leads.length;i++){
      if(soloDigitos_(leads[i].tel).slice(-9) === telNuevo){
        return {ok:true, duplicado:true};
      }
    }
  }
  var hoy = hoyMadrid();
  leads.push({
    id: lead.id || ('meta_' + Date.now()),
    nombre: lead.nombre || '', tel: lead.tel || '', mail: lead.mail || '',
    procedencia: lead.procedencia || 'Ads', interes: lead.interes || 'Sin definir',
    estado: lead.estado || 'E0', nota: lead.nota || '',
    fechaGestion: hoy, fechaVisita: '', ultimoContacto: '',
    creadoEn: new Date().toISOString(), llamar: false, llamarResultado: ''
  });
  actualizarLeadEnSheet_(leads[leads.length-1]); // OPTIMIZACIÓN: solo añadir una fila
  return {ok:true, anadido:true};
}

// ============================================================
//   ACCESO A HOJAS
// ============================================================
function libro_(){ return SpreadsheetApp.getActiveSpreadsheet(); }
function hojaLeads_(){ var s = libro_().getSheetByName('Leads'); if(!s){ s = libro_().insertSheet('Leads'); } return s; }
function hojaConfig_(){ var s = libro_().getSheetByName('Config'); if(!s){ s = libro_().insertSheet('Config'); } return s; }

// Actualiza una SOLA fila del lead en el Sheet (busca por id). Mucho más rápido
// que writeLeads completo. Si el lead no existe en el sheet, lo añade al final.
function actualizarLeadEnSheet_(lead){
  if(!lead || !lead.id) return false;
  var s = hojaLeads_();
  var data = s.getDataRange().getValues();
  for(var i=1;i<data.length;i++){
    var c = data[i][0];
    if(!c || String(c).charAt(0) !== '{') continue;
    try{
      var l = JSON.parse(c);
      if(String(l.id) === String(lead.id)){
        s.getRange(i+1, 1).setNumberFormat('@').setValue(JSON.stringify(lead));
        return true;
      }
    }catch(e){}
  }
  // No existe: lo añado al final
  s.appendRow([JSON.stringify(lead)]);
  return true;
}

function readLeads(){
  var data = hojaLeads_().getDataRange().getValues();
  var out = [];
  for(var i=0;i<data.length;i++){
    var c = data[i][0];
    if(c && String(c).charAt(0) === '{'){
      try{
        var l = JSON.parse(c);
        if(!l._borrado) out.push(l); // v7: marcas de borrado de la v6 no cuentan
      }catch(e){}
    }
  }
  return out;
}

// El CRM solo envía los leads que ha cambiado; el resto se conserva tal cual
// está en la hoja. Los que llegan con _borrado:true se eliminan.
function writeLeads(incoming, yaCompleto){
  var borrar = {};
  incoming = incoming.filter(function(l){
    if(l && l._borrado){ if(l.id) borrar[l.id] = true; return false; }
    return true;
  });
  if(!yaCompleto){
    var actuales = readLeads();
    var ids = {};
    for(var i=0;i<incoming.length;i++){ if(incoming[i].id) ids[incoming[i].id] = true; }
    for(var j=0;j<actuales.length;j++){
      if(actuales[j].id && !ids[actuales[j].id] && !borrar[actuales[j].id]) incoming.push(actuales[j]);
    }
  }
  var s = hojaLeads_();
  s.clearContents();
  var rows = [['lead_json (no editar a mano)']];
  for(var k=0;k<incoming.length;k++){ rows.push([JSON.stringify(incoming[k])]); }
  s.getRange(1,1,rows.length,1).setNumberFormat('@').setValues(rows);
}

function readPlantillas(){
  var v = hojaConfig_().getRange('A1').getValue();
  if(!v) return null;
  try{ return JSON.parse(v); }catch(e){ return null; }
}
function writePlantillas(plnt){
  hojaConfig_().getRange('A1').setNumberFormat('@').setValue(JSON.stringify(plnt));
}
