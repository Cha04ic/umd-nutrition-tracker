  const url = "https://www.nutritionix.com/potbelly/menu/premium?desktop";  
  const rx = new RegExp("nutrition|calories|protein|carb|fat", "i");        
  fetch(url)                                                                
    .then(r => r.text())                                                    
    .then(t => {                                                            
      const scripts = (t.match(/<script[^>]*>[\s\S]*?<\/script>/gi) || []); 
      const hits = scripts.filter(s => rx.test(s));                         
      console.log("scriptBlocksWithNutrition", hits.length);                
      console.log((hits[0] || "").slice(0, 4000));                          
    })                                                                      
    .catch(err => console.error(err));                                      
