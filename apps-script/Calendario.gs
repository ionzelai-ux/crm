/*** CODEK - Invitaciones de Google Calendar para las visitas (v2: dúos con "(+1)" en el título) ***/
/*** Va en un proyecto de Apps Script APARTE, creado con la cuenta codek@codektr.com,
     para que las invitaciones salgan de la cuenta de la empresa.
     Cada 5 minutos mira los leads en visita (E5) con fecha de hoy en adelante y:
       - si no tienen invitación, la manda (evento de 1 hora en el calendario de codek@);
       - si cambias la fecha o la hora, mueve el evento (al cliente le llega "actualizado");
       - si la visita deja de estar en E5 ANTES de que llegue la hora, la cancela.
     El estado queda en la pestaña "Calendario" del Sheet del CRM (no editar a mano). ***/

var SHEET_ID = '16pTF2fIJl3vhWYYYoAImTSwuDV8M0DL6aPJKUACRNUI';
var DIRECCION = 'Calle de la Metalurgia 8 (posterior), 28108 Alcobendas, Madrid';
var DURACION_MIN = 60;
var TITULO = 'Visita CODEK Training';
var MAIL_PRUEBA = 'ionzelai@gmail.com';
var MAX_POR_VUELTA = 20;   // tope de invitaciones nuevas cada 5 minutos
var MIN_LEADS = 100;       // si la hoja trae menos leads, se está guardando: no se toca nada
var ZONA = 'Europe/Madrid';
var CAB = ['id_lead','nombre','mail','fecha','hora','id_evento','estado','respuesta','actualizado','duo'];

// ------------------------------------------------------------
// 1) Ejecuta "probar" una vez: te manda una invitación de prueba a tu Gmail.
// 2) Si te llega bien, ejecuta "borrarPrueba" y luego "instalar".
// ------------------------------------------------------------
function probar(){
  var manana = Utilities.formatDate(new Date(Date.now() + 86400000), ZONA, 'yyyy-MM-dd');
  var ev = crearEvento_({nombre:'PRUEBA', mail:MAIL_PRUEBA, fecha:manana, hora:'10:00'});
  PropertiesService.getScriptProperties().setProperty('evento_prueba', ev.id);
  Logger.log('Invitación de prueba enviada a ' + MAIL_PRUEBA + ' para mañana a las 10:00');
}
function borrarPrueba(){
  var id = PropertiesService.getScriptProperties().getProperty('evento_prueba');
  if(!id){ Logger.log('No hay prueba que borrar'); return; }
  Calendar.Events.remove('primary', id, {sendUpdates:'all'});
  PropertiesService.getScriptProperties().deleteProperty('evento_prueba');
  Logger.log('Prueba borrada');
}

// Deja programado sincronizarVisitas cada 5 minutos y lo ejecuta ya una vez.
function instalar(){
  ScriptApp.getProjectTriggers().forEach(function(t){
    if(t.getHandlerFunction() === 'sincronizarVisitas') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sincronizarVisitas').timeBased().everyMinutes(5).create();
  sincronizarVisitas();
  Logger.log('Instalado: se revisan las visitas cada 5 minutos');
}
// Por si algún día quieres pararlo
function desinstalar(){
  ScriptApp.getProjectTriggers().forEach(function(t){
    if(t.getHandlerFunction() === 'sincronizarVisitas') ScriptApp.deleteTrigger(t);
  });
  Logger.log('Parado');
}

// ------------------------------------------------------------
function sincronizarVisitas(){
  var lock = LockService.getScriptLock();
  if(!lock.tryLock(1000)) return;
  try{
    var libro = SpreadsheetApp.openById(SHEET_ID);
    var leads = leerLeads_(libro);
    if(leads.length < MIN_LEADS){ Logger.log('Hoja de leads incompleta (' + leads.length + '), se reintenta luego'); return; }
    var porId = {};
    leads.forEach(function(l){ porId[String(l.id)] = l; });

    var hoja = hojaCalendario_(libro);
    var filas = hoja.getDataRange().getValues().slice(1);
    var estado = {};   // id_lead -> {fila, datos}
    filas.forEach(function(r, i){ if(r[0]) estado[String(r[0])] = {fila:i+2, r:r.map(String)}; });

    var hoy = Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd');
    var ahora = Utilities.formatDate(new Date(), ZONA, "yyyy-MM-dd'T'HH:mm");
    var nuevas = 0;

    // Visitas que deben tener invitación
    leads.forEach(function(l){
      var v = visita_(l);
      if(!v || v.fecha < hoy) return;
      var st = estado[v.id];
      try{
        if(!st || st.r[6] !== 'invitado' || !st.r[5]){
          if(nuevas >= MAX_POR_VUELTA) return;
          var ev = crearEvento_(v);
          nuevas++;
          st = guardar_(hoja, st, [v.id, v.nombre, v.mail, v.fecha, v.hora, ev.id, 'invitado', 'pendiente', ahora, v.duo]);
          estado[v.id] = st;
        } else if(st.r[3] !== v.fecha || st.r[4] !== v.hora || st.r[2] !== v.mail || (st.r[9] || '') !== v.duo){
          var mueve = st.r[3] !== v.fecha || st.r[4] !== v.hora || st.r[2] !== v.mail;
          var cambios = {summary:titulo_(v)};
          if(mueve){ cambios.start = inicio_(v); cambios.end = fin_(v); }
          if(st.r[2] !== v.mail) cambios.attendees = [{email:v.mail, displayName:v.nombre}];
          // Si solo cambia el dúo (título) no se avisa al cliente
          Calendar.Events.patch(cambios, 'primary', st.r[5], {sendUpdates: mueve ? 'all' : 'none'});
          estado[v.id] = guardar_(hoja, st, [v.id, v.nombre, v.mail, v.fecha, v.hora, st.r[5], 'invitado', st.r[7] || 'pendiente', ahora, v.duo]);
        }
      }catch(err){
        // Si ya estaba invitado no se marca error (se crearía otra invitación): se reintenta mover en la siguiente vuelta
        if(st && st.r[6] === 'invitado' && st.r[5]) Logger.log(v.id + ': ' + err);
        else guardar_(hoja, st, [v.id, v.nombre, v.mail, v.fecha, v.hora, '', 'error', String(err).slice(0,200), ahora]);
      }
    });

    // Invitaciones que hay que cancelar o cuya respuesta hay que mirar
    Object.keys(estado).forEach(function(id){
      var st = estado[id];
      if(st.r[6] !== 'invitado' || !st.r[5]) return;
      var cuando = st.r[3] + 'T' + st.r[4];
      if(cuando <= ahora) return;              // ya pasó: no se toca
      var v = porId[id] ? visita_(porId[id]) : null;
      try{
        if(!v || v.fecha < hoy){
          Calendar.Events.remove('primary', st.r[5], {sendUpdates:'all'});
          var r = st.r.slice(); r[6] = 'cancelado'; r[8] = ahora;
          guardar_(hoja, st, r);
          return;
        }
        var ev = Calendar.Events.get('primary', st.r[5]);
        var resp = ev.status === 'cancelled' ? 'borrado a mano' : respuesta_(ev, v.mail);
        if(resp !== st.r[7]){
          var r2 = st.r.slice(); r2[7] = resp; r2[8] = ahora;
          if(ev.status === 'cancelled') r2[6] = 'cancelado';
          guardar_(hoja, st, r2);
        }
      }catch(err){ Logger.log(id + ': ' + err); }
    });
  } finally { lock.releaseLock(); }
}

// ------------------------------------------------------------
function leerLeads_(libro){
  var s = libro.getSheetByName('Leads');
  if(!s) return [];
  var out = [];
  s.getDataRange().getValues().forEach(function(r){
    var c = r[0];
    if(c && String(c).charAt(0) === '{'){
      try{ var l = JSON.parse(c); if(!l._borrado) out.push(l); }catch(e){}
    }
  });
  return out;
}

// Devuelve la visita del lead si está en E5 con fecha, hora y email válidos
function visita_(l){
  if(!l || l.estado !== 'E5') return null;
  var fecha = String(l.fechaVisita || '').slice(0,10);
  var h = String(l.horaVisita || '');
  var m = h.match(/(\d{2}):(\d{2}):\d{2} GMT/) || h.match(/^(\d{1,2}):(\d{2})/);  // "Sat Dec 30 1899 19:04:00 GMT..." o "19:04"
  var mail = String(l.mail || '').trim().toLowerCase();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !m || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return null;
  return {id:String(l.id), nombre:String(l.nombre || '').trim() || 'cliente', mail:mail, fecha:fecha,
          hora:('0' + m[1]).slice(-2) + ':' + m[2], duo: l.duo ? '1' : ''};
}

// "Visita CODEK Training · Marta Buzón (+1)" si vienen dos personas
function titulo_(v){ return TITULO + ' · ' + v.nombre + (v.duo ? ' (+1)' : ''); }
function inicio_(v){ return {dateTime: v.fecha + 'T' + v.hora + ':00', timeZone: ZONA}; }
function fin_(v){
  var p = v.hora.split(':'), t = Math.min(+p[0]*60 + +p[1] + DURACION_MIN, 23*60 + 59);
  return {dateTime: v.fecha + 'T' + ('0' + Math.floor(t/60)).slice(-2) + ':' + ('0' + t%60).slice(-2) + ':00', timeZone: ZONA};
}

function crearEvento_(v){
  var nombre = v.nombre.split(' ')[0];
  return Calendar.Events.insert({
    summary: titulo_(v),
    location: DIRECCION,
    description: 'Hola ' + nombre + ', te esperamos en CODEK Training para tu visita.\n\n' +
                 '📍 ' + DIRECCION + '\n\n' +
                 'Trae ropa cómoda y una botella de agua.\n' +
                 'Si necesitas cambiar la hora, responde a este correo.',
    start: inicio_(v),
    end: fin_(v),
    attendees: [{email: v.mail, displayName: v.nombre}],
    guestsCanSeeOtherGuests: false,
    reminders: {useDefault: true}
  }, 'primary', {sendUpdates: 'all'});
}

function respuesta_(ev, mail){
  var a = (ev.attendees || []).filter(function(x){ return String(x.email).toLowerCase() === mail; })[0];
  var s = a ? a.responseStatus : '';
  return s === 'accepted' ? 'aceptada' : s === 'declined' ? 'rechazada' : s === 'tentative' ? 'quizás' : 'pendiente';
}

function hojaCalendario_(libro){
  var s = libro.getSheetByName('Calendario');
  if(!s){
    s = libro.insertSheet('Calendario');
    s.getRange(1, 1, 1, CAB.length).setValues([CAB]);
    s.getRange('A:J').setNumberFormat('@');   // todo como texto: si no, la hora se convierte en fecha de 1899
  }
  if(s.getRange(1, 10).getValue() !== 'duo') s.getRange(1, 10).setValue('duo');   // v2
  return s;
}

// Escribe la fila (la crea si no existe) y devuelve el estado actualizado
function guardar_(hoja, st, fila){
  fila = fila.map(String);
  while(fila.length < CAB.length) fila.push('');
  var n = st ? st.fila : hoja.getLastRow() + 1;
  hoja.getRange(n, 1, 1, CAB.length).setNumberFormat('@').setValues([fila]);
  return {fila:n, r:fila};
}
