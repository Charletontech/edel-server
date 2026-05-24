async function test() {
  const loginRes = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'jamiedoe@mail.com', password: '12345' })
  });
  
  if (!loginRes.ok) {
    console.log('Login failed:', await loginRes.text());
    return;
  }
  
  const user = await loginRes.json();
  console.log('Login success, token:', user.token.substring(0, 20) + '...');
  
  const form = new FormData();
  form.append('profilePhoto', new Blob(['test'], { type: 'image/jpeg' }), 'test.jpg');
  
  const putRes = await fetch('http://localhost:5000/api/profile/photo', {
    method: 'PUT',
    headers: {
      'Authorization': 'Bearer ' + user.token
    },
    body: form
  });
  
  console.log('Upload status:', putRes.status);
  console.log('Upload response:', await putRes.text());
}

test();
