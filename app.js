const API_URL = 'https://18.230.65.131:3000/products';

// Elementos do DOM
const productList = document.querySelector('#products');
const addProductForm = document.querySelector('#add-product-form');
const updateSection = document.querySelector('#update-section');
const updateProductForm = document.querySelector('#update-product-form');
const searchForm = document.querySelector('#search-form');
const searchResult = document.querySelector('#search-result');
const btnRefresh = document.querySelector('#btn-refresh');

// Campos do Formulário de Atualização
const updateProductId = document.querySelector('#update-id');
const updateProductName = document.querySelector('#update-name');
const updateProductPrice = document.querySelector('#update-price');
const updateProductDescription = document.querySelector('#update-description');

// Mudei o texto do botão para refletir a nova função dele
btnRefresh.textContent = 'Sincronizar com o Banco 💾';

// ==========================================
// ESTADO LOCAL DA APLICAÇÃO (MEMÓRIA TEMPORÁRIA)
// ==========================================
let localProducts = []; // Guarda o que está na tela
let pendingChanges = {
  added: [],    // Produtos novos aguardando ir para o banco
  updated: [],  // Produtos editados aguardando ir para o banco
  deleted: []   // IDs de produtos que precisam ser apagados do banco
};

// ==========================================
// RENDERIZAÇÃO DA TELA (Usa apenas a memória local)
// ==========================================
function renderProducts() {
  productList.innerHTML = '';

  localProducts.forEach(product => {
    const li = document.createElement('li');
    li.className = 'product-item';
    
    // Se o produto for novo (ainda não está no banco), damos um destaque visual a ele
    const isNew = String(product.id).startsWith('temp-');
    if (isNew) li.style.borderLeft = '4px solid #4CAF50';

    const infoDiv = document.createElement('div');
    infoDiv.className = 'product-info';
    infoDiv.innerHTML = `<strong>${product.name}</strong> - R$ ${Number(product.price).toFixed(2)}<br><small>${product.description}</small>`;

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'product-actions';

    // Botão Editar
    const updateButton = document.createElement('button');
    updateButton.textContent = 'Editar';
    updateButton.className = 'btn-warning';
    updateButton.addEventListener('click', () => showUpdateForm(product));

    // Botão Excluir
    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'Excluir';
    deleteButton.className = 'btn-danger';
    deleteButton.addEventListener('click', () => handleDelete(product.id));

    actionsDiv.appendChild(updateButton);
    actionsDiv.appendChild(deleteButton);

    li.appendChild(infoDiv);
    li.appendChild(actionsDiv);
    productList.appendChild(li);
  });
}

// ==========================================
// LÓGICA DE MANIPULAÇÃO LOCAL (Não acessa o banco ainda)
// ==========================================

function handleAdd(name, price, description) {
  // Cria um ID temporário apenas para a tela se encontrar
  const tempProduct = { id: 'temp-' + Date.now(), name, price, description };
  
  localProducts.push(tempProduct); // Adiciona na tela
  pendingChanges.added.push(tempProduct); // Coloca na fila de adição
  
  renderProducts();
  alert('Produto adicionado na tela! Clique em "Sincronizar" para salvar no banco.');
}

function handleUpdate(id, name, price, description) {
  // Atualiza no array da tela
  const productIndex = localProducts.findIndex(p => String(p.id) === String(id));
  if (productIndex !== -1) {
    localProducts[productIndex] = { id, name, price, description };
  }

  // Verifica se é um produto que já estava na fila de adição (ainda não tem ID real)
  const isTemp = String(id).startsWith('temp-');
  
  if (isTemp) {
    // Se for temporário, atualiza os dados na fila de adição
    const addIndex = pendingChanges.added.findIndex(p => p.id === id);
    if (addIndex !== -1) pendingChanges.added[addIndex] = { id, name, price, description };
  } else {
    // Se for um produto do banco, coloca na fila de atualização
    // Se já tinha uma atualização pendente para ele, remove a velha e põe a nova
    pendingChanges.updated = pendingChanges.updated.filter(p => p.id !== id);
    pendingChanges.updated.push({ id, name, price, description });
  }

  renderProducts();
  updateSection.classList.add('hidden');
  alert('Produto modificado na tela! Clique em "Sincronizar" para salvar no banco.');
}

function handleDelete(id) {
  if (!confirm('Tem certeza que deseja excluir da tela?')) return;

  // Remove da tela
  localProducts = localProducts.filter(p => String(p.id) !== String(id));

  const isTemp = String(id).startsWith('temp-');
  
  if (isTemp) {
    // Se era novo e foi apagado, só tiramos da fila de adição
    pendingChanges.added = pendingChanges.added.filter(p => p.id !== id);
  } else {
    // Se era do banco, precisa avisar o Supabase para deletar quando sincronizar
    pendingChanges.deleted.push(id);
    // Removemos de possíveis filas de atualização
    pendingChanges.updated = pendingChanges.updated.filter(p => p.id !== id);
  }

  renderProducts();
}

// ==========================================
// INTEGRAÇÃO COM O BACK-END (Busca inicial e Sincronização)
// ==========================================

// Puxa os dados reais ao carregar a página
async function fetchInitialData() {
  try {
    const response = await fetch(API_URL);
    if (!response.ok) throw new Error('Erro ao buscar do banco');
    
    localProducts = await response.json();
    
    // Zera a fila de pendências
    pendingChanges = { added: [], updated: [], deleted: [] };
    
    renderProducts();
  } catch (error) {
    console.error(error);
    productList.innerHTML = '<li>Erro ao conectar com a API.</li>';
  }
}

// O Grande Botão: Executa a fila de pendências no back-end
btnRefresh.addEventListener('click', async () => {
  btnRefresh.textContent = 'Salvando... ⏳';
  btnRefresh.disabled = true;

  try {
    // 1. Executa as exclusões
    for (const id of pendingChanges.deleted) {
      await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
    }

    // 2. Executa as atualizações
    for (const prod of pendingChanges.updated) {
      await fetch(`${API_URL}/${prod.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: prod.name, price: prod.price, description: prod.description })
      });
    }

    // 3. Executa as adições (tirando o ID temporário para o Supabase criar um de verdade)
    for (const prod of pendingChanges.added) {
      await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: prod.name, price: prod.price, description: prod.description })
      });
    }

    alert('Sincronização concluída com sucesso!');
    
    // Puxa os dados atualizados reais do banco para gerar os IDs definitivos na tela
    await fetchInitialData();

  } catch (error) {
    console.error("Erro durante a sincronização:", error);
    alert('Houve um erro ao sincronizar. Verifique o console.');
  } finally {
    btnRefresh.textContent = 'Sincronizar com o Banco 💾';
    btnRefresh.disabled = false;
  }
});


// ==========================================
// EVENTOS DOS FORMULÁRIOS E BUSCA
// ==========================================

addProductForm.addEventListener('submit', event => {
  event.preventDefault();
  handleAdd(
    addProductForm.elements['name'].value,
    addProductForm.elements['price'].value,
    addProductForm.elements['description'].value
  );
  addProductForm.reset();
});

updateProductForm.addEventListener('submit', event => {
  event.preventDefault();
  handleUpdate(
    updateProductId.value,
    updateProductName.value,
    updateProductPrice.value,
    updateProductDescription.value
  );
  updateProductForm.reset();
});

// A busca continua indo direto no banco, pois busca um registro específico real
searchForm.addEventListener('submit', async event => {
  event.preventDefault();
  const id = document.querySelector('#search-id').value;
  
  try {
    const response = await fetch(`${API_URL}/${id}`);
    if (response.status === 404) {
      searchResult.innerHTML = '<p style="color: red;">Produto não encontrado no banco.</p>';
      return;
    }
    const product = await response.json();
    searchResult.innerHTML = `
      <div style="background: #e8f5e9; padding: 10px; border-radius: 4px; color: #333;">
        <strong>ID:</strong> ${product.id} <br>
        <strong>Nome:</strong> ${product.name} <br>
        <strong>Preço:</strong> R$ ${Number(product.price).toFixed(2)} <br>
        <strong>Descrição:</strong> ${product.description}
      </div>
    `;
  } catch (error) {
    searchResult.innerHTML = '<p style="color: red;">Erro ao buscar produto.</p>';
  }
});

document.querySelector('#cancel-update').addEventListener('click', () => {
  updateProductForm.reset();
  updateSection.classList.add('hidden');
});

function showUpdateForm(product) {
  updateProductId.value = product.id;
  updateProductName.value = product.name;
  updateProductPrice.value = product.price;
  updateProductDescription.value = product.description;
  
  updateSection.classList.remove('hidden');
  updateSection.scrollIntoView({ behavior: 'smooth' });
}

// Inicialização
window.addEventListener('load', fetchInitialData);