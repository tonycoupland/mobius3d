var control_id_list = ['geometryType', 'segments', 'polygonRadius', 'ringRadius', 'colour', 'sides', 'cornerSmoothing', 'ratio', 'twist'];

export function updateURLFromInputs() {
    const params = new URLSearchParams();
    control_id_list.forEach(id => {
        const val = document.getElementById(id).value;
        params.set(id, val);
    });
    const newURL = `${window.location.pathname}?${params.toString()}`;
    history.replaceState(null, '', newURL);
}

export function applyInputsFromURL() {
    const params = new URLSearchParams(window.location.search);
    control_id_list.forEach(id => {
        if (params.has(id)) {
            document.getElementById(id).value = params.get(id);
        }
    });
    
}

export function getConfig(){
    var config = {};
    config["sides"] = parseInt(document.getElementById('sides').value);
    config["polyRadius"] = parseFloat(document.getElementById('polygonRadius').value);
    config["ringRadius"] = parseFloat(document.getElementById('ringRadius').value);
    config["segments"] = parseInt(document.getElementById('segments').value);
    config["twist"] = parseFloat(document.getElementById('twist').value);
    config["cornerSmoothing"] = parseFloat(document.getElementById('cornerSmoothing').value);
    config["geometryType"] = document.getElementById('geometryType').value;
    config["ratio"] = parseInt(document.getElementById('ratio').value);
    config["colour"] = document.getElementById('colour').value;
    return config;
}