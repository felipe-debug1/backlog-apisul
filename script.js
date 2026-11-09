const BIN_ID = "6aecb44fac6210605a6fd45e";

var DB = {
  stages: ["Priorização", "Backlog Aprovado", "Em Desenvolvimento", "Homologação", "Validado em Homologação", "Produção"],
  tasks: []
};
var F = "all", V = "k", Q = "", SEL = null;

function showToast(msg) {
  var container = document.getElementById("toast-container");
  var t = document.createElement("div");
  t.className = "toast";
  t.innerText = msg;
  container.appendChild(t);
  setTimeout(function() { t.remove(); }, 3000);
}

function checkAuthAndInit() {
  let key = sessionStorage.getItem("jsonbin_key");
  if (key) {
    document.getElementById("auth-modal").style.display = "none";
  } else {
    document.getElementById("auth-modal").style.display = "flex";
  }
  loadFromCloud();
}

document.getElementById("auth-btn").onclick = async function() {
  let inputKey = document.getElementById("api-key-input").value.trim();
  if (!inputKey) { showToast("Insira a chave."); return; }
  try {
    let res = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, {
      headers: { "X-Master-Key": inputKey }
    });
    if (res.status === 401 || res.status === 403) { showToast("Chave inválida!"); return; }
    sessionStorage.setItem("jsonbin_key", inputKey);
    document.getElementById("auth-modal").style.display = "none";
    showToast("Autenticado com sucesso!");
  } catch(e) { showToast("Erro ao validar."); }
};

function getApiKeyForEdit() { return sessionStorage.getItem("jsonbin_key"); }

async function loadFromCloud() {
  try {
    var res = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`);
    var data = await res.json();
    var record = data.record;
    
    if (Array.isArray(record)) {
      DB.tasks = record;
    } else {
      DB.stages = record.stages || DB.stages;
      DB.tasks = record.tasks || [];
    }

    DB.tasks = DB.tasks.map(function(t){
      if(typeof t.resp === "string") {
        t.resp = t.resp.split(",").map(function(s){ return s.trim(); }).filter(Boolean);
      }
      if(!t.resp) t.resp = [];
      if(!t.obs) t.obs = "";
      if(t.s >= DB.stages.length) t.s = DB.stages.length - 1;
      return t;
    });

    drawF();
    render();
  } catch(e) { console.error("Erro ao carregar", e); }
}

async function saveToCloud() {
  const apiKey = getApiKeyForEdit();
  if (!apiKey) { checkAuthAndInit(); return false; }
  try {
    var res = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-Master-Key": apiKey },
      body: JSON.stringify(DB)
    });
    if (res.status === 401 || res.status === 403) {
      showToast("Sessão expirada ou chave inválida!");
      sessionStorage.removeItem("jsonbin_key");
      checkAuthAndInit();
      return false;
    }
    return true;
  } catch(e) { showToast("Erro ao salvar na nuvem."); return false; }
}

function fd(v){
  if(!v) return "";
  var p = v.split("-");
  return p.length === 3 ? p[2]+"/"+p[1]+"/"+p[0] : v;
}

function od(x){
  var lastStageIdx = DB.stages.length - 1;
  if(!x.ini || x.s >= lastStageIdx) return false;
  var p = x.ini.includes("-") ? x.ini.split("-") : x.ini.split("/");
  var t = new Date(); t.setHours(0,0,0,0);
  var target = p.length === 3 && p[0].length === 4 ? new Date(p[0], p[1]-1, p[2]) : new Date(2026, p[1]-1, p[0]);
  return target < t;
}

function byId(i){ return DB.tasks.filter(function(x){ return x.id === i; })[0]; }

function rel(x){
  var r = [x.id];
  if(x.dep) r.push(x.dep);
  DB.tasks.forEach(function(y){ if(y.dep === x.id) r.push(y.id); });
  return r;
}

function vis(x){
  if(Q && (x.id+" "+x.t+" "+(x.resp||[]).join(" ")).toLowerCase().indexOf(Q) < 0) return false;
  if(F==="Hub"||F==="Apisul"||F==="eCargo") return x.sys === F;
  if(F==="Melhoria") return (x.tags||[]).indexOf("Melhoria") > -1;
  if(F==="dep") return !!x.dep || DB.tasks.some(function(y){ return y.dep === x.id; });
  return true;
}

function esc(s){ return (s||"").replace(/[&<>]/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;"}[c]; }); }

function getSysClass(sys) {
  if (sys === "Apisul") return "APS";
  if (sys === "eCargo") return "ECG";
  return "Hub";
}

function card(x){
  var hl = SEL ? (rel(SEL).indexOf(x.id) > -1 ? " hl" : " dim") : "";
  var sysName = x.sys || "Hub";
  var m = '<span>'+sysName+'</span>';
  if((x.tags||[]).indexOf("Melhoria") > -1) m += '<span>Melhoria</span>';
  if(x.resp && x.resp.length) m += '<span class="resp">'+esc(x.resp.join(", "))+'</span>';
  if(x.dep) m += '<span class="dep">depende de '+x.dep+'</span>';
  else if(DB.tasks.some(function(y){ return y.dep === x.id; })) m += '<span class="dep">libera '+DB.tasks.filter(function(y){ return y.dep === x.id; }).map(function(y){ return y.id; }).join(", ")+'</span>';
  
  var todayStr = new Date().toISOString().split("T")[0];
  
  // Validação Homologação: Fica em vermelho se a data estimada já passou (menor que hoje) 
  // e a tarefa ainda não chegou na etapa de Homologação (índice < 3)[cite: 1]
  var hLate = false;
  if(x.h && x.s < 3 && x.h < todayStr) {
    hLate = true;
  }
  
  // Validação Produção/Fim: se a data efetiva (ini) é maior que a estimativa de produção (p)
  var pLate = false;
  if(x.ini && x.p && x.ini > x.p) {
    pLate = true;
  }

  if(x.ini) m += '<span'+(od(x)?' class="late"':'')+'>efetivo (prod): '+fd(x.ini)+(od(x)?' · vencido':'')+'</span>';
  if(x.h) m += '<span'+(hLate?' class="late"':'')+'>homologação (est.): '+fd(x.h)+'</span>';
  if(x.p) m += '<span'+(pLate?' class="late"':'')+'>produção (est.): '+fd(x.p)+'</span>';
  
  var maxStage = DB.stages.length - 1;
  return '<div class="card '+getSysClass(x.sys)+hl+'" data-id="'+x.id+'">'+
   '<div class="top"><span>'+x.id+'</span><span class="mv"><button data-mv="-1"'+(x.s===0?" disabled":"")+'>‹</button><button data-mv="1"'+(x.s>=maxStage?" disabled":"")+'>›</button></span></div>'+
   '<p>'+esc(x.t)+'</p><div class="meta">'+m+'</div></div>';
}

function render(){
  var n = DB.tasks.length || 1;
  var lastStageIdx = DB.stages.length - 1;
  
  var prod = DB.tasks.filter(function(x){ return x.s === lastStageIdx; }).length;
  var dev = DB.tasks.filter(function(x){ return x.s > 1 && x.s < lastStageIdx; }).length;
  var bk = DB.tasks.filter(function(x){ return x.s === 0 || x.s === 1; }).length;

  var countHub = DB.tasks.filter(function(x){ return (x.sys || "Hub") === "Hub"; }).length;
  var countApisul = DB.tasks.filter(function(x){ return x.sys === "Apisul"; }).length;
  var countECargo = DB.tasks.filter(function(x){ return x.sys === "eCargo"; }).length;

  var pctProd = Math.round((prod / n) * 100);
  var pctDev = Math.round((dev / n) * 100);
  var pctBk = Math.round((bk / n) * 100);

  var pctHub = Math.round((countHub / n) * 100);
  var pctApisul = Math.round((countApisul / n) * 100);
  var pctECargo = Math.round((countECargo / n) * 100);

  // Dividindo os KPIs com rótulos de categoria para evitar confusão de soma
  var kpisHtml = `
    <div style="width:100%; font-size:12px; font-weight:bold; color:var(--mut); margin-bottom:-4px; margin-top:4px; text-transform:uppercase; letter-spacing:0.5px;">Visão Geral e Status do Fluxo</div>
  ` + [
    [DB.tasks.length, "atividades no plano", ""],
    [pctProd + "%", "concluídas ("+prod+"/"+DB.tasks.length+")", "Status Final"],
    [pctDev + "%", "em andamento ("+dev+"/"+DB.tasks.length+")", "Em progresso"],
    [pctBk + "%", "aguardando ("+bk+"/"+DB.tasks.length+")", "Fila inicial"]
  ].map(function(k){ 
    return '<div class="kpi"><b>'+k[0]+'</b><span>'+k[1]+'</span></div>'; 
  }).join("") + `
    <div style="width:100%; font-size:12px; font-weight:bold; color:var(--mut); margin-bottom:-4px; margin-top:8px; text-transform:uppercase; letter-spacing:0.5px;">Distribuição por Sistema</div>
  ` + [
    [pctHub + "%", "Hub ("+countHub+" tarefas)", "Por sistema"],
    [pctApisul + "%", "Apisul ("+countApisul+" tarefas)", "Por sistema"],
    [pctECargo + "%", "eCargo ("+countECargo+" tarefas)", "Por sistema"]
  ].map(function(k){ 
    return '<div class="kpi"><b>'+k[0]+'</b><span>'+k[1]+'</span></div>'; 
  }).join("");

  document.getElementById("kpis").innerHTML = kpisHtml;
  
  document.getElementById("flow").innerHTML = DB.stages.map(function(s,i){ 
    var c = DB.tasks.filter(function(x){ return x.s===i; }).length; 
    var p = Math.round((c / n) * 100);
    return '<div><i style="width:'+p+'%"></i><b>'+c+' <small style="font-size:11px;font-weight:normal;color:var(--mut);">('+p+'%)</small></b><span>'+s+'</span></div>'; 
  }).join("");
  
  var L = DB.tasks.filter(vis), el = document.getElementById("view");
  if(V==="k"){
    el.innerHTML = '<div class="board">'+DB.stages.map(function(s,i){ var c = L.filter(function(x){ return x.s===i; });
      return '<section class="col"><h2>'+s+'<em>'+c.length+'</em></h2>'+(c.length ? c.map(card).join("") : '<div class="empty">Nenhuma atividade nesta etapa.</div>')+'</section>'; }).join("")+'</div>';
  } else {
    var todayStr = new Date().toISOString().split("T")[0];
    el.innerHTML = '<div class="tw"><table><thead><tr><th>Código</th><th>Atividade</th><th>Responsáveis</th><th>Sistema</th><th>Etapa</th><th>Homologação (Est.)</th><th>Produção (Est.)</th><th>Data Fim (Efetiva Prod.)</th><th>Ação</th></tr></thead><tbody>'+
     L.map(function(x){ 
       var hLate = x.h && x.s < 3 && x.h < todayStr;
       var pLate = x.ini && x.p && x.ini > x.p;
       return '<tr><td><b>'+x.id+'</b></td><td>'+esc(x.t)+'</td><td>'+esc((x.resp||[]).join(", "))+'</td><td>'+(x.sys||"Hub")+'</td><td>'+(DB.stages[x.s]||"Etapa "+x.s)+'</td>'+
       '<td'+(hLate?' style="color:var(--late); font-weight:bold;"':'')+'>'+(x.h?fd(x.h):"—")+'</td>'+
       '<td'+(pLate?' style="color:var(--late); font-weight:bold;"':'')+'>'+(x.p?fd(x.p):"—")+'</td>'+
       '<td'+(od(x)?' style="color:var(--late); font-weight:bold;"':'')+'>'+(x.ini?fd(x.ini)+(od(x)?' · vencido':''):"—")+'</td>'+
       '<td><button class="btn-edit" data-id="'+x.id+'">✏️ Editar</button></td></tr>'; 
     }).join("")+'</tbody></table></div>';
  }
}

var FL = [["all","Todas"],["Hub","Hub"],["Apisul","Apisul"],["eCargo","eCargo"],["Melhoria","Melhorias"],["dep","Com dependência"]];
function drawF(){
  document.getElementById("filters").innerHTML = FL.map(function(f){ return '<button data-f="'+f[0]+'"'+(F===f[0]?' class="on"':"")+'>'+f[1]+'</button>'; }).join("");
}
document.getElementById("filters").onclick = function(e){ var b = e.target.closest("button"); if(b){ F = b.dataset.f; drawF(); render(); } };
document.getElementById("q").oninput = function(e){ Q = e.target.value.toLowerCase().trim(); render(); };
function setV(v){ V = v; document.getElementById("vk").className = v==="k"?"on":""; document.getElementById("vl").className = v==="l"?"on":""; render(); }
document.getElementById("vk").onclick = function(){ setV("k"); }; document.getElementById("vl").onclick = function(){ setV("l"); };

function openCardModal(task){
  var isNew = !task;
  var t = task || { id: "TSK-"+Math.floor(Math.random()*900+100), t: "", sys: "Hub", s: 0, resp: [], dep: "", ini: "", h: "", p: "", obs: "", tags: [] };
  
  var stageOptions = DB.stages.map(function(s, idx){
    return '<option value="'+idx+'" '+(t.s === idx ? 'selected' : '')+'>'+s+'</option>';
  }).join("");

  var html = `
    <input type="hidden" id="modal-task-id" value="${t.id}">
    <label style="font-size:12px; color:var(--mut);">Código / ID</label>
    <input type="text" id="m-id" value="${t.id}" ${!isNew?"disabled":""} style="margin-bottom:10px;">
    
    <label style="font-size:12px; color:var(--mut);">Título da Atividade</label>
    <input type="text" id="m-title" value="${esc(t.t)}" style="margin-bottom:10px;">
    
    <div style="display:flex; gap:10px; margin-bottom:10px;">
      <div style="flex:1;">
        <label style="font-size:12px; color:var(--mut);">Etapa / Coluna</label>
        <select id="m-stage" class="txt">${stageOptions}</select>
      </div>
      <div style="flex:1;">
        <label style="font-size:12px; color:var(--mut);">Sistema</label>
        <select id="m-sys" class="txt">
          <option value="Hub" ${t.sys==="Hub"?'selected':''}>Hub</option>
          <option value="Apisul" ${t.sys==="Apisul"?'selected':''}>Apisul</option>
          <option value="eCargo" ${t.sys==="eCargo"?'selected':''}>eCargo</option>
        </select>
      </div>
    </div>

    <label style="font-size:12px; color:var(--mut);">Responsáveis (separados por vírgula)</label>
    <input type="text" id="m-resp" value="${(t.resp||[]).join(", ")}" placeholder="Ex: João, Maria" style="margin-bottom:10px;">

    <div style="display:flex; gap:10px; margin-bottom:10px;">
      <div style="flex:1;">
        <label style="font-size:12px; color:var(--mut);">Depende de (ID)</label>
        <input type="text" id="m-dep" value="${t.dep||""}">
      </div>
      <div style="flex:1;">
        <label style="font-size:12px; color:var(--mut);">Data Fim (Efetiva em Produção)</label>
        <input type="date" id="m-ini" class="dt" value="${t.ini||""}" style="width:100%;">
      </div>
    </div>

    <div style="display:flex; gap:10px; margin-bottom:10px;">
      <div style="flex:1;">
        <label style="font-size:12px; color:var(--mut);">Data Homologação (Estimativa)</label>
        <input type="date" id="m-h" class="dt" value="${t.h||""}" style="width:100%;">
      </div>
      <div style="flex:1;">
        <label style="font-size:12px; color:var(--mut);">Data Produção (Estimativa)</label>
        <input type="date" id="m-p" class="dt" value="${t.p||""}" style="width:100%;">
      </div>
    </div>

    <label style="font-size:12px; color:var(--mut);">Observações / Anotações Internas</label>
    <textarea id="m-obs" class="txt" rows="3" placeholder="Detalhes técnicos, links ou observações..." style="resize:vertical; margin-bottom:10px;">${esc(t.obs || "")}</textarea>
  `;
  document.getElementById("card-form-content").innerHTML = html;
  document.getElementById("del-card-btn").style.display = isNew ? "none" : "block";
  document.getElementById("card-modal").style.display = "flex";
}

document.getElementById("close-card-btn").onclick = function(){ document.getElementById("card-modal").style.display = "none"; };
document.getElementById("new-task-btn").onclick = function(){ openCardModal(null); };

document.getElementById("view").onclick = async function(e){
  var btnEdit = e.target.closest(".btn-edit");
  if(btnEdit){ openCardModal(byId(btnEdit.dataset.id)); return; }

  var c = e.target.closest(".card");
  if(!c) return;
  var cardId = c.dataset.id, b = e.target.closest("button[data-mv]");
  if(b){
    var item = byId(cardId);
    var oldStage = item.s;
    var maxStage = DB.stages.length - 1;
    item.s = Math.max(0, Math.min(maxStage, item.s + (+b.dataset.mv)));
    var savedCloud = await saveToCloud();
    if(savedCloud) render(); else item.s = oldStage;
    return;
  }
  
  if(e.altKey || e.ctrlKey){
    SEL = SEL === cardId ? null : cardId;
    render();
  } else {
    openCardModal(byId(cardId));
  }
};

document.getElementById("save-card-btn").onclick = async function(){
  var id = document.getElementById("m-id").value.trim();
  var title = document.getElementById("m-title").value.trim();
  if(!id || !title){ showToast("Preencha o ID e o Título."); return; }

  var task = byId(id);
  var isNew = !task;
  if(isNew){
    task = { id: id, tags: [] };
    DB.tasks.push(task);
  }

  task.t = title;
  task.s = parseInt(document.getElementById("m-stage").value, 10);
  task.sys = document.getElementById("m-sys").value;
  task.resp = document.getElementById("m-resp").value.split(",").map(function(s){ return s.trim(); }).filter(Boolean);
  task.dep = document.getElementById("m-dep").value.trim();
  task.ini = document.getElementById("m-ini").value;
  task.h = document.getElementById("m-h").value;
  task.p = document.getElementById("m-p").value;
  task.obs = document.getElementById("m-obs").value.trim();

  var ok = await saveToCloud();
  if(ok){
    document.getElementById("card-modal").style.display = "none";
    showToast("Atividade salva com sucesso!");
    render();
  }
};

document.getElementById("del-card-btn").onclick = async function(){
  var id = document.getElementById("m-id").value;
  if(confirm("Tem certeza que deseja excluir a tarefa "+id+"?")){
    DB.tasks = DB.tasks.filter(function(x){ return x.id !== id; });
    var ok = await saveToCloud();
    if(ok){
      document.getElementById("card-modal").style.display = "none";
      showToast("Tarefa excluída.");
      render();
    }
  }
};

function renderStageManager(){
  var html = "";
  for (var i = 0; i < DB.stages.length; i++) {
    html += '<div style="background:var(--bg); padding:6px 10px; border-radius:6px; border:1px solid var(--line); font-size:13px; display:flex; align-items:center; justify-content:space-between;">' +
      '<span><b>'+(i+1)+'.</b> '+esc(DB.stages[i])+'</span>' +
      '<div style="display:flex; gap:4px; align-items:center;">' +
        (i > 0 ? '<button type="button" class="btn-move-up" data-idx="'+i+'" style="padding:2px 6px; font-size:11px;" title="Subir etapa">▲</button>' : '') +
        (i < DB.stages.length - 1 ? '<button type="button" class="btn-move-down" data-idx="'+i+'" style="padding:2px 6px; font-size:11px;" title="Descer etapa">▼</button>' : '') +
        '<button type="button" class="btn-del-stage" data-idx="'+i+'" style="border:none; background:none; cursor:pointer; color:var(--late); font-weight:bold; margin-left:6px;" title="Excluir">✕</button>' +
      '</div>' +
    '</div>';
  }
  document.getElementById("stage-list-view").innerHTML = html;
}

document.getElementById("open-stage-modal").onclick = function(){
  renderStageManager();
  document.getElementById("stage-modal").style.display = "flex";
};
document.getElementById("close-stage-btn").onclick = function(){
  document.getElementById("stage-modal").style.display = "none";
  render();
};

document.getElementById("add-stage-btn").onclick = async function(){
  var ns = document.getElementById("new-stage-input").value.trim();
  if(!ns) return;
  if(DB.stages.indexOf(ns) > -1){ showToast("Etapa já existe."); return; }
  DB.stages.push(ns);
  
  var ok = await saveToCloud();
  if(ok){
    document.getElementById("new-stage-input").value = "";
    renderStageManager();
    render();
    showToast("Nova etapa adicionada!");
  }
};

document.getElementById("stage-list-view").onclick = async function(e){
  var delBtn = e.target.closest(".btn-del-stage");
  var moveUpBtn = e.target.closest(".btn-move-up");
  var moveDownBtn = e.target.closest(".btn-move-down");

  if(delBtn){
    var idx = parseInt(delBtn.getAttribute("data-idx"), 10);
    var stageName = DB.stages[idx];
    
    if(DB.stages.length <= 1){
      showToast("O kanban precisa ter ao menos uma etapa.");
      return;
    }

    var tasksInStage = DB.tasks.filter(function(t){ return t.s === idx; });
    if(tasksInStage.length > 0){
      var targetIdx = prompt('A etapa "'+stageName+'" possui '+tasksInStage.length+' tarefa(s).\nDigite o número da etapa de destino (de 1 a '+DB.stages.length+') para mover essas tarefas antes de excluir:');
      if(targetIdx === null) return;
      targetIdx = parseInt(targetIdx, 10) - 1;
      
      if(isNaN(targetIdx) || targetIdx < 0 || targetIdx >= DB.stages.length || targetIdx === idx){
        showToast("Etapa de destino inválida.");
        return;
      }
      
      DB.tasks.forEach(function(t){
        if(t.s === idx) t.s = targetIdx;
      });
    }
    
    if(confirm("Excluir a etapa \""+stageName+"\"?")){
      DB.stages.splice(idx, 1);
      DB.tasks.forEach(function(t){
        if(t.s === idx) {
          t.s = Math.max(0, idx - 1);
        } else if(t.s > idx) {
          t.s--;
        }
      });
      var ok = await saveToCloud();
      if(ok){
        renderStageManager();
        render();
        showToast("Etapa excluída com sucesso.");
      }
    }
  }

  if(moveUpBtn || moveDownBtn){
    var btn = moveUpBtn || moveDownBtn;
    var idx = parseInt(btn.getAttribute("data-idx"), 10);
    var targetIdx = moveUpBtn ? idx - 1 : idx + 1;

    if(targetIdx < 0 || targetIdx >= DB.stages.length) return;

    var temp = DB.stages[idx];
    DB.stages[idx] = DB.stages[targetIdx];
    DB.stages[targetIdx] = temp;

    DB.tasks.forEach(function(t){
      if(t.s === idx) t.s = targetIdx;
      else if(t.s === targetIdx) t.s = idx;
    });

    var ok = await saveToCloud();
    if(ok){
      renderStageManager();
      render();
      showToast("Ordem das etapas atualizada!");
    }
  }
};

checkAuthAndInit();
