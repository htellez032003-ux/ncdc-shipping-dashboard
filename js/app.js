document.getElementById('login-btn').addEventListener('click',()=>{
  const email=document.getElementById('login-email').value.trim();
  const pass=document.getElementById('login-password').value.trim();
  if(email==='htellez032003@gmail.com' && pass==='Ltapparel040523'){
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-shell').classList.remove('hidden');
  } else {
    document.getElementById('login-error').classList.remove('hidden');
  }
});