// public/app.js

document.addEventListener('DOMContentLoaded', () => {
    const ordersTableBody = document.getElementById('ordersTableBody');
    const addOrderForm = document.getElementById('addOrderForm');
    const showAddOrderFormBtn = document.getElementById('showAddOrderFormBtn');
    const modal = document.getElementById('addOrderModal');
    const modalTitle = modal ? modal.querySelector('h3') : null;
    const modalSubmitButton = modal ? modal.querySelector('button[type="submit"]') : null;
    const closeButton = modal ? modal.querySelector('.modal-content .close-button') : null;

    // Cəmi məbləğlər üçün elementlər
    const totalOrdersEl = document.getElementById('totalOrders');
    const totalQiymetUSDEl = document.getElementById('totalQiymetUSD');
    const totalQiymetAZNEl = document.getElementById('totalQiymetAZN');
    const totalQaliqUSDEl = document.getElementById('totalQaliqUSD');
    const totalQaliqAZNEl = document.getElementById('totalQaliqAZN');
    const totalGelirAZNEl = document.getElementById('totalGelirAZN');

    let currentOrders = []; // Yüklənmiş sifarişləri burada saxlayaq
    let editingOrderId = null; // Hansı sifarişin redaktə olunduğunu izləmək üçün (null = yeni sifariş)

    // Modal pəncərəni "Əlavə Etmə" rejiminə qaytarmaq üçün funksiya
    const resetModalToCreateMode = () => {
        if (addOrderForm) addOrderForm.reset();
        ['qiymetUSD', 'qiymetAZN', 'qaliqUSD', 'qaliqAZN', 'gelirAZN'].forEach(id => {
            const inputElement = document.getElementById(id);
            if (inputElement) inputElement.value = '0';
        });
        const statusElement = document.getElementById('status');
        if (statusElement) statusElement.value = 'Davam edir';
        
        if (modalTitle) modalTitle.textContent = 'Yeni Sifariş Əlavə Et';
        if (modalSubmitButton) modalSubmitButton.textContent = 'Sifarişi Əlavə Et';
        editingOrderId = null; 
    };

    // Modal pəncərənin açılıb-bağlanması
    if (showAddOrderFormBtn && modal) { 
        showAddOrderFormBtn.onclick = () => {
            resetModalToCreateMode(); 
            modal.style.display = 'block';
        }
    }

    if (closeButton && modal) { 
        closeButton.onclick = () => {
            modal.style.display = 'none';
            resetModalToCreateMode(); 
        }
    }
    window.onclick = (event) => {
        if (event.target == modal && modal) {
            modal.style.display = 'none';
            resetModalToCreateMode(); 
        }
    }

    // Sifarişləri serverdən yükləyib cədvəldə göstərmək
    const fetchOrdersAndRender = async () => {
        try {
            const response = await fetch('/api/orders', {
                headers: {
                    'Accept': 'application/json' 
                }
            }); 
            if (!response.ok) {
                if (response.status === 401) { 
                    alert('Sessiyanız bitib və ya giriş edilməyib. Zəhmət olmasa, yenidən daxil olun.');
                    window.location.href = '/login.html'; 
                    return; 
                }
                let serverErrorMsg = response.statusText;
                try {
                    const errorResult = await response.json(); 
                    serverErrorMsg = errorResult.message || errorResult.details || response.statusText;
                } catch (e) { 
                    console.warn("Serverdən gələn xəta cavabı JSON formatında deyil (fetchOrdersAndRender):", e, await response.text());
                 }
                throw new Error(`Server xətası: ${response.status} - ${serverErrorMsg}`);
            }
            
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") !== -1) {
                const orders = await response.json(); 
                currentOrders = orders; 
                renderOrdersTable(orders);
            } else {
                const responseText = await response.text();
                console.error("Serverdən JSON gözlənilirdi, lakin başqa formatda cavab gəldi:", responseText);
                throw new Error("Serverdən gözlənilməyən formatda cavab alındı. Bu, çox güman ki, login səhifəsinə yönləndirmədir.");
            }
        } catch (error) { 
            console.error('Sifarişlər yüklənərkən xəta:', error);
            if (ordersTableBody) { 
                ordersTableBody.innerHTML = `<tr><td colspan="14" style="text-align:center; color:red;">Sifarişləri yükləmək mümkün olmadı: ${error.message}</td></tr>`;
            }
        }
    };

    const renderOrdersTable = (orders) => {
        if (!ordersTableBody) return; 
        ordersTableBody.innerHTML = ''; 

        if (orders.length === 0) {
            ordersTableBody.innerHTML = '<tr><td colspan="14" style="text-align:center;">Heç bir sifariş tapılmadı.</td></tr>';
            if (totalOrdersEl) totalOrdersEl.textContent = '0';
            if (totalQiymetUSDEl) totalQiymetUSDEl.textContent = '0.00';
            if (totalQiymetAZNEl) totalQiymetAZNEl.textContent = '0.00';
            if (totalQaliqUSDEl) totalQaliqUSDEl.textContent = '0.00';
            if (totalQaliqAZNEl) totalQaliqAZNEl.textContent = '0.00';
            if (totalGelirAZNEl) totalGelirAZNEl.textContent = '0.00';
            return;
        }

        let sumQiymetUSD = 0, sumQiymetAZN = 0, sumQaliqUSD = 0, sumQaliqAZN = 0, sumGelirAZN = 0;

        orders.forEach(order => {
            const row = ordersTableBody.insertRow();
            
            const formatDate = (dateString) => {
                if (!dateString) return ''; 
                try {
                    const parts = dateString.split('-'); 
                    if (parts.length === 3) {
                        const year = parseInt(parts[0]);
                        const month = parseInt(parts[1]) - 1; 
                        const day = parseInt(parts[2]);
                        const manualDate = new Date(Date.UTC(year, month, day)); 
                        if (!isNaN(manualDate.getTime())) {
                            return manualDate.toLocaleDateString('az-AZ', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
                        }
                    } return dateString; 
                } catch (e) { console.warn("Tarix formatlama xətası:", e, "Original dəyər:", dateString); return dateString; }
            };

            row.insertCell().textContent = order.satisNo || '';
            row.insertCell().textContent = order.xariciSirket || '';
            row.insertCell().textContent = order.turist || '';
            row.insertCell().textContent = order.rezNomresi || '';
            row.insertCell().textContent = formatDate(order.girisTarixi);
            row.insertCell().textContent = formatDate(order.cixisTarixi);
            row.insertCell().textContent = (parseFloat(order.qiymetUSD) || 0).toFixed(2);
            row.insertCell().textContent = (parseFloat(order.qiymetAZN) || 0).toFixed(2);
            row.insertCell().textContent = (parseFloat(order.qaliqUSD) || 0).toFixed(2);
            row.insertCell().textContent = (parseFloat(order.qaliqAZN) || 0).toFixed(2);
            row.insertCell().textContent = (parseFloat(order.gelirAZN) || 0).toFixed(2);
            
            const statusCell = row.insertCell();
            statusCell.textContent = order.status || '';
            statusCell.className = ''; 
            if (order.status === 'Davam edir') statusCell.classList.add('status-davam-edir');
            else if (order.status === 'Ləğv edildi') statusCell.classList.add('status-legv-edildi');
            else if (order.status === 'Bitdi') statusCell.classList.add('status-bitdi');

            const operationsCell = row.insertCell(); 
            const editButton = document.createElement('button');
            editButton.classList.add('action-btn', 'edit');
            editButton.innerHTML = '✏️'; 
            editButton.title = 'Düzəliş et';
            editButton.onclick = () => handleEditOrder(order.satisNo); 

            const deleteButton = document.createElement('button');
            deleteButton.classList.add('action-btn', 'delete');
            deleteButton.innerHTML = '🗑️'; 
            deleteButton.title = 'Sifarişi sil';
            deleteButton.onclick = () => handleDeleteOrder(order.satisNo); 

            operationsCell.appendChild(editButton);
            operationsCell.appendChild(deleteButton);

            const qeydCell = row.insertCell();
            qeydCell.innerHTML = `<button class="action-btn note" title="Qeydə bax (hazırda aktiv deyil)">📄</button>`;

            sumQiymetUSD += parseFloat(order.qiymetUSD) || 0;
            sumQiymetAZN += parseFloat(order.qiymetAZN) || 0;
            sumQaliqUSD += parseFloat(order.qaliqUSD) || 0;
            sumQaliqAZN += parseFloat(order.qaliqAZN) || 0;
            sumGelirAZN += parseFloat(order.gelirAZN) || 0;
        });

        if (totalOrdersEl) totalOrdersEl.textContent = orders.length;
        if (totalQiymetUSDEl) totalQiymetUSDEl.textContent = sumQiymetUSD.toFixed(2);
        if (totalQiymetAZNEl) totalQiymetAZNEl.textContent = sumQiymetAZN.toFixed(2);
        if (totalQaliqUSDEl) totalQaliqUSDEl.textContent = sumQaliqUSD.toFixed(2);
        if (totalQaliqAZNEl) totalQaliqAZNEl.textContent = sumQaliqAZN.toFixed(2);
        if (totalGelirAZNEl) totalGelirAZNEl.textContent = sumGelirAZN.toFixed(2);
    };

    function handleEditOrder(satisNo) {
        const orderToEdit = currentOrders.find(order => String(order.satisNo) === String(satisNo));
        if (!orderToEdit || !addOrderForm || !modal) return;
        editingOrderId = satisNo; 
        const setInputValue = (id, value) => { const el = document.getElementById(id); if (el) el.value = value; };
        setInputValue('xariciSirket', orderToEdit.xariciSirket || '');
        setInputValue('turist', orderToEdit.turist || '');
        setInputValue('rezNomresi', orderToEdit.rezNomresi || '');
        setInputValue('girisTarixi', orderToEdit.girisTarixi ? orderToEdit.girisTarixi.split('T')[0] : '');
        setInputValue('cixisTarixi', orderToEdit.cixisTarixi ? orderToEdit.cixisTarixi.split('T')[0] : '');
        setInputValue('qiymetUSD', String(orderToEdit.qiymetUSD || '0'));
        setInputValue('qiymetAZN', String(orderToEdit.qiymetAZN || '0'));
        setInputValue('qaliqUSD', String(orderToEdit.qaliqUSD || '0'));
        setInputValue('qaliqAZN', String(orderToEdit.qaliqAZN || '0'));
        setInputValue('gelirAZN', String(orderToEdit.gelirAZN || '0'));
        setInputValue('status', orderToEdit.status || 'Davam edir');
        setInputValue('qeyd', orderToEdit.qeyd || '');
        if (modalTitle) modalTitle.textContent = `Sifarişi Redaktə Et (№ ${satisNo})`;
        if (modalSubmitButton) modalSubmitButton.textContent = 'Dəyişiklikləri Yadda Saxla';
        modal.style.display = 'block'; 
    }
    
    async function handleDeleteOrder(satisNo) {
        if (!confirm(`'${satisNo}' nömrəli sifarişi silmək istədiyinizə əminsiniz?`)) { return; }
        try {
            const response = await fetch(`/api/orders/${satisNo}`, { 
                method: 'DELETE',
                headers: { 'Accept': 'application/json' } 
            });
            if (response.ok) { const result = await response.json(); console.log(result.message); fetchOrdersAndRender(); } 
            else { 
                if (response.status === 401) { alert('Sessiyanız bitib...'); window.location.href = '/login.html'; return; }
                let errorMsg = `Server xətası: ${response.status}`; 
                try { const errorResult = await response.json(); errorMsg = errorResult.message || errorResult.details || response.statusText; } 
                catch (e) { errorMsg = response.statusText; } 
                alert(`Sifariş silinərkən xəta (${response.status}): ${errorMsg}`);
            }
        } catch (error) { console.error(`Sifariş (${satisNo}) silinərkən xəta:`, error); alert('