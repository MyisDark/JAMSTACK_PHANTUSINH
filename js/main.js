let currentPrime = 0;
let currentElement = 0;
let ordersCalculated = false;
let worker = null;
let calculating = false;
// Thêm biến cache để lưu kết quả tính toán phần tử sinh
let generatorsCache = {
    prime: null,
    generators: null,
    totalCount: null,
    phi: null
};
// Thêm cache cho kết quả tính cấp
let ordersCache = {
    prime: null,
    orders: []
};
// Thêm mảng lưu lịch sử tính toán
let calculationHistory = [];

// Khởi tạo worker
function initWorker() {
    if (worker === null) {
        // Tạo worker bằng Blob để tránh lỗi CORS
        const workerCode = `
            // Cache cho các kết quả tính toán
            const cache = {
                primeFactors: new Map(),
                orders: new Map(),
                generators: new Map()
            };

            // Hàm kiểm tra số nguyên tố
            function isPrime(n) {
                if (n < 2) return false;
                if (n === 2) return true;
                if (n % 2 === 0) return false;
                
                const sqrt = Math.sqrt(n);
                for (let i = 3; i <= sqrt; i += 2) {
                    if (n % i === 0) return false;
                }
                return true;
            }

            // Hàm tính GCD với tối ưu
            function gcd(a, b) {
                while (b) {
                    [a, b] = [b, a % b];
                }
                return a;
            }

            // Hàm tính modular exponentiation siêu tối ưu
            function modPow(base, exp, modulus) {
                if (exp === 0) return 1;
                base = base % modulus;
                let result = 1;
                
                while (exp > 0) {
                    if (exp % 2 === 1) {
                        result = (result * base) % modulus;
                    }
                    base = (base * base) % modulus;
                    exp = Math.floor(exp / 2);
                }
                
                return result;
            }

            // Hàm tìm các ước số nguyên tố
            function findPrimeFactors(n) {
                if (cache.primeFactors.has(n)) {
                    return cache.primeFactors.get(n);
                }
                
                const factors = new Set();
                let temp = n;
                
                while (temp % 2 === 0) {
                    factors.add(2);
                    temp = temp / 2;
                }
                
                for (let i = 3; i <= Math.sqrt(temp); i += 2) {
                    while (temp % i === 0) {
                        factors.add(i);
                        temp = temp / i;
                    }
                }
                
                if (temp > 2) {
                    factors.add(temp);
                }
                
                const result = Array.from(factors);
                cache.primeFactors.set(n, result);
                return result;
            }

            // Hàm tính cấp của phần tử
            function findOrder(element, p, phi, primeFactors) {
                const key = \`\${element},\${p}\`;
                if (cache.orders.has(key)) {
                    return cache.orders.get(key);
                }
                
                let order = phi;
                
                for (const factor of primeFactors) {
                    while (order % factor === 0) {
                        const newOrder = order / factor;
                        if (modPow(element, newOrder, p) === 1) {
                            order = newOrder;
                        } else {
                            break;
                        }
                    }
                }
                
                cache.orders.set(key, order);
                return order;
            }

            // Xử lý message từ main thread
            self.onmessage = function(e) {
                const { type, data } = e.data;
                
                switch (type) {
                    case 'calculateOrders':
                        try {
                            const { p } = data;
                            const phi = p - 1;
                            const primeFactors = findPrimeFactors(phi);
                            const orders = [];
                            let processed = 0;
                            
                            // Gửi thông báo bắt đầu
                            self.postMessage({
                                type: 'progress',
                                data: {
                                    current: 0,
                                    total: p - 1,
                                    processed: 0,
                                    percent: 0
                                }
                            });

                            // Tính toán theo từng batch nhỏ
                            const batchSize = 5;
                            for (let g = 1; g < p; g++) {
                                if (gcd(g, p) === 1) {
                                    const order = findOrder(g, p, phi, primeFactors);
                                    orders.push({ element: g, order });
                                    processed++;
                                }

                                // Cập nhật tiến trình thường xuyên
                                if (g % batchSize === 0 || g === p - 1) {
                                    const percent = Math.floor((g / (p - 1)) * 100);
                                    self.postMessage({
                                        type: 'progress',
                                        data: {
                                            current: g,
                                            total: p - 1,
                                            processed,
                                            orders: orders.slice(-batchSize),
                                            percent
                                        }
                                    });
                                }
                            }

                            // Gửi kết quả cuối cùng
                            self.postMessage({
                                type: 'ordersComplete',
                                data: { orders, processed }
                            });
                        } catch (error) {
                            self.postMessage({
                                type: 'error',
                                data: { message: error.message }
                            });
                        }
                        break;

                    case 'findGenerators':
                        try {
                            const { prime } = data;
                            const phi = prime - 1;
                            const primeFactors = findPrimeFactors(phi);
                            const generators = [];
                            let processed = 0;
                            
                            // Gửi thông báo bắt đầu
                            self.postMessage({
                                type: 'progress',
                                data: {
                                    current: 0,
                                    total: prime - 1,
                                    processed: 0,
                                    percent: 0
                                }
                            });

                            // Tính toán theo từng batch nhỏ
                            const batchSize = 5;
                            for (let g = 2; g < prime; g++) {
                                if (gcd(g, prime) === 1) {
                                    let isGen = true;
                                    // Kiểm tra phần tử sinh
                                    for (const factor of primeFactors) {
                                        if (modPow(g, phi / factor, prime) === 1) {
                                            isGen = false;
                                            break;
                                        }
                                    }
                                    if (isGen) {
                                        generators.push(g);
                                    }
                                    processed++;
                                }

                                // Cập nhật tiến trình thường xuyên
                                if (g % batchSize === 0 || g === prime - 1) {
                                    const percent = Math.floor((g / (prime - 1)) * 100);
                                    self.postMessage({
                                        type: 'generatorProgress',
                                        data: {
                                            current: g,
                                            total: prime - 1,
                                            generators: generators.slice(),
                                            count: generators.length,
                                            percent
                                        }
                                    });
                                }
                            }

                            // Gửi kết quả cuối cùng
                            self.postMessage({
                                type: 'generatorsComplete',
                                data: {
                                    generators,
                                    totalCount: generators.length,
                                    phi
                                }
                            });
                        } catch (error) {
                            self.postMessage({
                                type: 'error',
                                data: { message: error.message }
                            });
                        }
                        break;
                        
                    case 'clearCache':
                        cache.primeFactors.clear();
                        cache.orders.clear();
                        cache.generators.clear();
                        self.postMessage({ type: 'cacheCleared' });
                        break;
                }
            };
        `;
        
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        worker = new Worker(URL.createObjectURL(blob));
        worker.onmessage = handleWorkerMessage;
    }
}

// Xử lý message từ worker
function handleWorkerMessage(e) {
    const { type, data } = e.data;
    
    switch (type) {
        case 'progress':
            updateProgressBar(data.percent);
            if (data.orders && data.orders.length > 0) {
                appendOrders(data.orders);
            }
            break;
            
        case 'ordersComplete':
            ordersCalculated = true;
            const progressContainer = document.querySelector('.calculation-progress');
            if (progressContainer) {
                // Thêm thông báo hoàn thành
                const completionMessage = document.createElement('div');
                completionMessage.className = 'completion-message';
                completionMessage.innerHTML = `
                    <i class="fas fa-check-circle"></i>
                    <span>Tính cấp các phần tử hoàn tất!</span>
                `;
                progressContainer.parentNode.insertBefore(completionMessage, progressContainer);
                
                // Ẩn thanh tiến trình
                progressContainer.classList.add('completed');
                
                // Xóa thanh tiến trình sau 3 giây
                setTimeout(() => {
                    progressContainer.remove();
                }, 3000);
            }
            showNotification('Tính cấp các phần tử hoàn tất', 'success');
            updateStepIndicator(3);
            calculating = false;
            break;
            
        case 'generatorProgress':
            // Chỉ cập nhật UI nếu đang ở bước cuối
            const finalResult = document.getElementById('finalResult');
            if (finalResult && finalResult.innerHTML !== '') {
                updateProgressBar(data.percent);
                updateGeneratorsList(data.generators, data.current, data.total);
            }
            break;
            
        case 'generatorsComplete':
            // Lưu kết quả vào cache
            generatorsCache = {
                prime: currentPrime,
                generators: data.generators,
                totalCount: data.totalCount,
                phi: data.phi
            };
            
            // Thêm vào lịch sử tính toán
            calculationHistory.unshift({
                timestamp: new Date().toLocaleString(),
                prime: currentPrime,
                totalCount: data.totalCount,
                phi: data.phi
            });
            
            // Giới hạn lịch sử lưu trữ 20 kết quả gần nhất
            if (calculationHistory.length > 20) {
                calculationHistory.pop();
            }
            
            // Chỉ hiển thị kết quả nếu đang ở bước cuối
            const finalResultElement = document.getElementById('finalResult');
            if (finalResultElement && finalResultElement.innerHTML !== '') {
                showFinalResults(data.generators, data.totalCount, data.phi);
            }
            calculating = false;
            break;
            
        case 'cacheCleared':
            // Clear cache khi có yêu cầu
            generatorsCache = {
                prime: null,
                generators: null,
                totalCount: null,
                phi: null
            };
            showNotification('Đã xóa cache', 'info');
            break;
            
        case 'error':
            console.error('Worker error:', data.message);
            showNotification('Có lỗi xảy ra: ' + data.message, 'error');
            calculating = false;
            break;
    }
}

// Hiển thị progress bar
function showProgressBar() {
    let progressBar = document.getElementById('progressBar');
    if (!progressBar) {
        progressBar = document.createElement('div');
        progressBar.id = 'progressBar';
        progressBar.className = 'progress mt-2';
        progressBar.innerHTML = `
            <div class="progress-bar progress-bar-striped progress-bar-animated" 
                 role="progressbar" 
                 style="width: 0%" 
                 aria-valuenow="0" 
                 aria-valuemin="0" 
                 aria-valuemax="100">
                0%
            </div>`;
    }
    return progressBar;
}

// Cập nhật progress bar
function updateProgressBar(percent) {
    console.log('Updating progress:', percent + '%');
    
    const progressBar = document.querySelector('.progress-bar');
    if (progressBar) {
        progressBar.style.width = percent + '%';
        progressBar.setAttribute('aria-valuenow', percent);
        progressBar.textContent = percent + '%';
    }

    const miniProgress = document.querySelector('.calculation-progress');
    if (miniProgress) {
        const miniBar = miniProgress.querySelector('.mini-progress-bar');
        const percentText = miniProgress.querySelector('.progress-percentage');
        if (miniBar && percentText) {
            miniBar.style.width = percent + '%';
            percentText.textContent = percent + '%';
        }
    }
}

// Ẩn progress bar
function hideProgressBar() {
    const progressBar = document.getElementById('progressBar');
    if (progressBar) {
        progressBar.remove();
    }
}

// Thêm kết quả tính cấp
function appendOrders(orders) {
    console.log('Appending orders:', orders.length);
    
    const tbody = document.querySelector('#ordersResult tbody');
    if (!tbody) return;
    
    orders.forEach(({ element, order }) => {
        // Thêm vào cache
        ordersCache.orders.push({ element, order });
        
        const isGen = order === currentPrime - 1;
        const row = document.createElement('tr');
        row.className = isGen ? 'generator-row' : '';
        row.innerHTML = `
            <td>${element}</td>
            <td>${order}</td>
            <td>${isGen ? '<span class="badge bg-success">Phần tử sinh</span>' : ''}</td>`;
        tbody.appendChild(row);
    });
}

// Cập nhật danh sách phần tử sinh
function updateGeneratorsList(generators, current, total) {
    const result = document.getElementById('finalResult');
    const existingProgress = result.querySelector('.calculation-progress');
    
    if (!existingProgress) {
        const progressContainer = document.createElement('div');
        progressContainer.className = 'calculation-progress';
        progressContainer.innerHTML = `
            <div class="progress-text">
                <span class="progress-label">Đang tìm phần tử sinh...</span>
                <span class="progress-percentage">0%</span>
            </div>
            <div class="mini-progress">
                <div class="mini-progress-bar" style="width: 0%"></div>
            </div>
        `;
        result.appendChild(progressContainer);
    }

    const tempResults = document.createElement('div');
    tempResults.className = 'alert alert-info';
    tempResults.innerHTML = `
        <h5>Tiến trình tìm phần tử sinh</h5>
        <p>Đã tìm thấy ${generators.length} phần tử sinh (đang xử lý ${current}/${total})</p>
    `;
    
    const existingTemp = result.querySelector('.alert-info');
    if (existingTemp) {
        existingTemp.replaceWith(tempResults);
    } else {
        result.appendChild(tempResults);
    }
}

// Hiển thị kết quả cuối cùng
function showFinalResults(generators, totalCount, phi) {
    const result = document.getElementById('finalResult');
    
    // Ẩn thanh tiến trình ngay từ đầu
    const progressContainer = result.querySelector('.calculation-progress');
    if (progressContainer) {
        progressContainer.remove();
    }
    
    if (generators.length > 0) {
        const percentage = ((generators.length / phi) * 100).toFixed(2);
        
        // Thêm thông báo hoàn thành
        const completionMessage = document.createElement('div');
        completionMessage.className = 'completion-message';
        completionMessage.innerHTML = `
            <i class="fas fa-check-circle"></i>
            <span>Tìm phần tử sinh hoàn tất!</span>
        `;
        result.appendChild(completionMessage);
        
        // Thêm thông tin bổ sung
        result.innerHTML += `
            <div class="alert alert-info mb-3">
                <h5>Thông tin bổ sung:</h5>
                <ul class="mb-0">
                    <li>Số phần tử trong nhóm: φ(${currentPrime}) = ${phi}</li>
                    <li>Số phần tử sinh: ${totalCount}</li>
                    <li>Tỷ lệ phần tử sinh: ${percentage}%</li>
                </ul>
            </div>
            <div class="text-end mb-3">
                <button class="btn btn-info btn-sm" onclick="showOrdersModal()">
                    <i class="fas fa-list"></i> Xem cấp của phần tử
                </button>
            </div>`;
            
        // Thêm bảng kết quả với scroll
        const scrollContainer = document.createElement('div');
        scrollContainer.className = 'result-scroll-container';
        scrollContainer.innerHTML = `
            <table class="table table-sm table-bordered">
                <thead>
                    <tr>
                        <th>STT</th>
                        <th>Phần tử sinh</th>
                    </tr>
                </thead>
                <tbody>
                    ${generators.map((g, i) => `
                        <tr class="table-success">
                            <td>${i + 1}</td>
                            <td>${g}</td>
                        </tr>`).join('')}
                </tbody>
            </table>
        `;
        result.appendChild(scrollContainer);
    } else {
        result.innerHTML = '<div class="alert alert-warning">Không tìm thấy phần tử sinh nào</div>';
    }
    
    showNotification('Tìm phần tử sinh hoàn tất', 'success');
}

// Thêm hàm hiển thị modal cấp của phần tử
function showOrdersModal() {
    // Tạo nội dung từ cache thay vì lấy từ ordersResult
    let modalContent = '';
    if (ordersCache.prime === currentPrime && ordersCache.orders.length > 0) {
        modalContent = `
            <div class="result-scroll-container">
                <table class="table table-sm table-bordered">
                    <thead>
                        <tr>
                            <th>Phần tử</th>
                            <th>Cấp</th>
                            <th>Trạng thái</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${ordersCache.orders.map(({ element, order }) => `
                            <tr class="${order === currentPrime - 1 ? 'generator-row' : ''}">
                                <td>${element}</td>
                                <td>${order}</td>
                                <td>${order === currentPrime - 1 ? '<span class="badge bg-success">Phần tử sinh</span>' : ''}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>`;
    } else {
        modalContent = '<div class="alert alert-warning">Không có dữ liệu về cấp của các phần tử. Vui lòng thực hiện bước 2 trước.</div>';
    }
    
    // Tạo modal động
    const modalHtml = `
        <div class="modal fade" id="ordersModal" tabindex="-1" aria-labelledby="ordersModalLabel" aria-hidden="true">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="ordersModalLabel">
                            <i class="fas fa-list"></i> Cấp của các phần tử trong Z<sub>${currentPrime}</sub>*
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
                        ${modalContent}
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Đóng</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Xóa modal cũ nếu tồn tại
    const oldModal = document.getElementById('ordersModal');
    if (oldModal) {
        oldModal.remove();
    }

    // Thêm modal mới vào body
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Hiển thị modal
    const modal = new bootstrap.Modal(document.getElementById('ordersModal'));
    modal.show();
}

// Hàm kiểm tra số nguyên tố
function isPrime(n) {
    if (n < 2) return false;
    if (n === 2) return true;
    if (n % 2 === 0) return false;
    
    const sqrt = Math.sqrt(n);
    for (let i = 3; i <= sqrt; i += 2) {
        if (n % i === 0) return false;
    }
    return true;
}

// Hàm tính GCD
function gcd(a, b) {
    while (b !== 0) {
        let temp = b;
        b = a % b;
        a = temp;
    }
    return a;
}

// Hàm tính modular exponentiation
function modPow(base, exp, modulus) {
    if (exp === 0n) return 1n;
    
    let result = 1n;
    base = BigInt(base) % BigInt(modulus);
    exp = BigInt(exp);
    
    while (exp > 0n) {
        if (exp & 1n) {
            result = (result * base) % BigInt(modulus);
        }
        base = (base * base) % BigInt(modulus);
        exp = exp >> 1n;
    }
    
    return Number(result);
}

// Hàm tìm các ước số nguyên tố
function findPrimeFactors(n) {
    const factors = new Set();
    let d = 2;
    while (n > 1) {
        while (n % d === 0) {
            factors.add(d);
            n = n / d;
        }
        d++;
        if (d * d > n) {
            if (n > 1) {
                factors.add(n);
            }
            break;
        }
    }
    return Array.from(factors);
}

// Hàm kiểm tra phần tử sinh
function isGenerator(g, p) {
    if (g <= 0 || g >= p) return false;
    
    const phi = p - 1;
    const factors = findPrimeFactors(phi);
    
    for (const factor of factors) {
        if (modPow(g, phi / factor, p) === 1) {
            return false;
        }
    }
    return true;
}

// Hàm tính cấp của phần tử
function findOrder(element, p) {
    const phi = p - 1;
    let order = 1;
    for (let i = 1; i <= phi; i++) {
        if (modPow(element, i, p) === 1) {
            order = i;
            break;
        }
    }
    return order;
}

// Hàm sinh số nguyên tố ngẫu nhiên
function generateRandomPrime() {
    const min = 2;
    const max = 25000;
    let num;
    do {
        num = Math.floor(Math.random() * (max - min + 1)) + min;
    } while (!isPrime(num));
    return num;
}

// Hàm sinh số ngẫu nhiên và hiển thị
function generateRandomPrimeNumber() {
    if (calculating) {
        showNotification('Đang có phép tính đang chạy, vui lòng đợi', 'warning');
        return;
    }
    const prime = generateRandomPrime();
    document.getElementById('primeInput').value = prime;
    checkPrime();
}

// Thêm hàm xóa kết quả theo cấp
function clearResultsByLevel(level) {
    if (level === 1) { // Cấp cao nhất (Bước 1)
        // Xóa kết quả của tất cả các bước cấp thấp hơn (Bước 2-5)
        document.querySelectorAll('.result-box').forEach(box => {
            if (box.id !== 'primeResult') {
                box.innerHTML = '';
            }
        });
        // Reset các biến trạng thái
        ordersCalculated = false;
        currentElement = 0;
        // Clear cache khi đổi số nguyên tố
        if (worker) {
            worker.postMessage({ type: 'clearCache' });
        }
        // Reset cả hai cache
        generatorsCache = {
            prime: null,
            generators: null,
            totalCount: null,
            phi: null
        };
        ordersCache = {
            prime: null,
            orders: []
        };
    }
    // Cấp 2 không cần xóa gì cả, giữ nguyên kết quả của các bước cùng cấp
}

// Sửa hàm checkPrime để xóa kết quả cấp thấp hơn
function checkPrime() {
    if (calculating) {
        showNotification('Đang có phép tính đang chạy, vui lòng đợi', 'warning');
        return;
    }
    
    const input = document.getElementById('primeInput');
    const value = parseInt(input.value);
    
    if (!value || value < 2) {
        showNotification('Vui lòng nhập số nguyên tố hợp lệ', 'error');
        return;
    }
    
    if (value > 25000) {
        showNotification('Số quá lớn, vui lòng nhập số nhỏ hơn 25000', 'error');
        return;
    }

    if (isPrime(value)) {
        currentPrime = value;
        ordersCalculated = false;
        document.getElementById('primeResult').innerHTML = `
            <div class="alert alert-success">
                <i class="fas fa-check-circle"></i> ${value} là số nguyên tố
            </div>`;
        showNotification('Kiểm tra số nguyên tố hoàn tất', 'success');
        updateStepIndicator(2);
        
        // Clear cache khi đổi số nguyên tố
        if (worker) {
            worker.postMessage({ type: 'clearCache' });
        }
    } else {
        currentPrime = 0;
        ordersCalculated = false;
        document.getElementById('primeResult').innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-times-circle"></i> ${value} không phải là số nguyên tố
            </div>`;
        showNotification('Số không phải là số nguyên tố', 'error');
    }
}

function calculateOrders() {
    if (calculating) {
        showNotification('Đang có phép tính đang chạy, vui lòng đợi', 'warning');
        return;
    }
    
    if (!currentPrime) {
        showNotification('Vui lòng nhập và kiểm tra số nguyên tố p trước!', 'error');
        return;
    }

    calculating = true;

    // Reset cache
    ordersCache = {
        prime: currentPrime,
        orders: []
    };

    // Xóa tất cả kết quả cũ trước khi tính toán mới
    document.querySelectorAll('.result-box').forEach(box => {
        if (box.id !== 'primeResult') { // Giữ lại kết quả kiểm tra số nguyên tố
            box.innerHTML = '';
        }
    });

    const result = document.getElementById('ordersResult');
    result.innerHTML = '';
    
    // Tạo progress indicator
    const progressContainer = document.createElement('div');
    progressContainer.className = 'calculation-progress';
    progressContainer.innerHTML = `
        <div class="progress-text">
            <span class="progress-label">Đang tính cấp các phần tử...</span>
            <span class="progress-percentage">0%</span>
        </div>
        <div class="mini-progress">
            <div class="mini-progress-bar" style="width: 0%"></div>
        </div>
    `;
    result.appendChild(progressContainer);
    
    // Tạo container cho bảng kết quả với scroll
    const scrollContainer = document.createElement('div');
    scrollContainer.className = 'result-scroll-container';
    scrollContainer.innerHTML = `
        <table class="table table-sm table-bordered">
            <thead>
                <tr>
                    <th>Phần tử</th>
                    <th>Cấp</th>
                    <th>Trạng thái</th>
                </tr>
            </thead>
            <tbody></tbody>
        </table>
    `;
    result.appendChild(scrollContainer);
    
    initWorker();
    worker.postMessage({
        type: 'calculateOrders',
        data: { p: currentPrime }
    });

    // Tính luôn phần tử sinh trong background
    setTimeout(() => {
        worker.postMessage({
            type: 'findGenerators',
            data: { prime: currentPrime }
        });
    }, 100);
}

function findAllGenerators() {
    if (calculating) {
        showNotification('Đang có phép tính đang chạy, vui lòng đợi', 'warning');
        return;
    }
    
    if (!currentPrime) {
        showNotification('Vui lòng nhập số nguyên tố p trước!', 'error');
        return;
    }

    // Xóa tất cả kết quả cũ trước khi tính toán mới
    document.querySelectorAll('.result-box').forEach(box => {
        if (box.id !== 'primeResult') { // Giữ lại kết quả kiểm tra số nguyên tố
            box.innerHTML = '';
        }
    });

    // Kiểm tra cache
    if (generatorsCache.prime === currentPrime && generatorsCache.generators) {
        // Nếu có cache, hiển thị kết quả ngay
        showFinalResults(
            generatorsCache.generators,
            generatorsCache.totalCount,
            generatorsCache.phi
        );
        return;
    }

    calculating = true;
    const result = document.getElementById('finalResult');
    result.innerHTML = '';
    
    // Tạo progress indicator
    const progressContainer = document.createElement('div');
    progressContainer.className = 'calculation-progress';
    progressContainer.innerHTML = `
        <div class="progress-text">
            <span class="progress-label">Đang tìm phần tử sinh...</span>
            <span class="progress-percentage">0%</span>
        </div>
        <div class="mini-progress">
            <div class="mini-progress-bar" style="width: 0%"></div>
        </div>
    `;
    result.appendChild(progressContainer);
    
    initWorker();
    worker.postMessage({
        type: 'findGenerators',
        data: { prime: currentPrime }
    });
}

function checkElement() {
    const g = parseInt(document.getElementById('elementInput').value);
    if (isNaN(g) || g <= 0) {
        showNotification('Vui lòng nhập một số nguyên dương hợp lệ', 'error');
        return;
    }
    if (!currentPrime) {
        showNotification('Vui lòng nhập số nguyên tố p trước!', 'error');
        return;
    }

    // Xóa kết quả cũ của các bước sau
    document.querySelectorAll('.result-box').forEach(box => {
        if (box.id !== 'primeResult' && box.id !== 'ordersResult' && box.id !== 'elementResult') {
            box.innerHTML = '';
        }
    });

    showNotification('Đang kiểm tra phần tử...', 'info');
    
    if (isGenerator(g, currentPrime)) {
        currentElement = g;
        document.getElementById('elementResult').innerHTML = `<div class="alert alert-success">✅ ${g} là phần tử sinh của Z<sub>${currentPrime}</sub>*</div>`;
        showNotification('Kiểm tra phần tử hoàn tất', 'success');
        updateStepIndicator(4);
    } else {
        currentElement = 0;
        document.getElementById('elementResult').innerHTML = `<div class="alert alert-warning">❌ ${g} không phải là phần tử sinh của Z<sub>${currentPrime}</sub>*</div>`;
        showNotification('Phần tử không phải là phần tử sinh', 'warning');
    }
}

function calculatePower() {
    const k = document.getElementById('powerInput').value;
    if (!/^\d+$/.test(k)) {
        showNotification('Vui lòng nhập một số không âm hợp lệ', 'error');
        return;
    }

    if (!currentPrime) {
        showNotification('Vui lòng nhập số nguyên tố p trước!', 'error');
        return;
    }
    if (!currentElement) {
        showNotification('Vui lòng kiểm tra phần tử g trước!', 'error');
        return;
    }

    // Xóa kết quả cũ của các bước sau
    document.querySelectorAll('.result-box').forEach(box => {
        if (box.id !== 'primeResult' && box.id !== 'ordersResult' && 
            box.id !== 'elementResult' && box.id !== 'powerResult') {
            box.innerHTML = '';
        }
    });

    try {
        const result = modPow(currentElement, BigInt(k), currentPrime);
        let html = `<div class="alert alert-info">`;
        html += `<h5>Kết quả tính lũy thừa modulo:</h5>`;
        html += `<div class="mt-2">`;
        html += `<strong>Input:</strong>`;
        html += `<ul>`;
        html += `<li>p = ${currentPrime} (modulo)</li>`;
        html += `<li>g = ${currentElement} (cơ số)</li>`;
        html += `<li>k = ${k} (số mũ)</li>`;
        html += `</ul>`;
        html += `<strong>Output:</strong> ${currentElement}<sup>${k}</sup> mod ${currentPrime} = ${result}`;
        html += `</div></div>`;
        
        document.getElementById('powerResult').innerHTML = html;
        showNotification('Tính lũy thừa modulo hoàn tất', 'success');
        updateStepIndicator(5);
    } catch (error) {
        showNotification('Có lỗi xảy ra khi tính toán', 'error');
    }
}

// Hàm hiển thị thông báo
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : 
                       type === 'error' ? 'fa-exclamation-circle' : 
                       type === 'warning' ? 'fa-exclamation-triangle' : 
                       'fa-info-circle'}"></i>
        <span>${message}</span>
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

// Hàm cập nhật chỉ số bước
function updateStepIndicator(step) {
    const indicators = document.querySelectorAll('.step-item');
    indicators.forEach((indicator, index) => {
        if (index + 1 < step) {
            indicator.classList.add('completed');
            indicator.classList.remove('active');
        } else if (index + 1 === step) {
            indicator.classList.add('active');
            indicator.classList.remove('completed');
        } else {
            indicator.classList.remove('active', 'completed');
        }
    });
}

// Các hàm xử lý modal
function openGuideModal() {
    var guideModal = new bootstrap.Modal(document.getElementById('guideModal'));
    guideModal.show();
}

function openFAQModal() {
    var faqModal = new bootstrap.Modal(document.getElementById('faqModal'));
    faqModal.show();
}

function openContactModal() {
    var contactModal = new bootstrap.Modal(document.getElementById('contactModal'));
    contactModal.show();
}

function openModal() {
    openGuideModal(); // Mặc định mở modal hướng dẫn khi click vào nút "Tìm hiểu thêm"
}

// Thêm event listener cho các phím tắt
document.addEventListener('keydown', function(e) {
    // Ctrl + Enter để tính toán
    if (e.ctrlKey && e.key === 'Enter') {
        if (document.activeElement.id === 'primeInput') {
            checkPrime();
        }
    }
    
    // Escape để hủy tính toán
    if (e.key === 'Escape' && calculating) {
        if (worker) {
            worker.terminate();
            worker = null;
            calculating = false;
            hideProgressBar();
            showNotification('Đã hủy phép tính', 'warning');
        }
    }
});

// Thêm hàm tạo thanh tiến trình
function createProgressIndicator(containerId) {
    const container = document.getElementById(containerId);
    const progressDiv = document.createElement('div');
    progressDiv.className = 'calculation-progress';
    progressDiv.innerHTML = `
        <div class="progress-text">
            <span class="progress-label">Tiến độ tính toán</span>
            <span class="progress-percentage">0%</span>
        </div>
        <div class="mini-progress">
            <div class="mini-progress-bar" style="width: 0%"></div>
        </div>
    `;
    container.appendChild(progressDiv);
    return progressDiv;
}

// Thêm hàm hiển thị lịch sử tính toán
function showCalculationHistory() {
    const historyModal = new bootstrap.Modal(document.getElementById('historyModal'));
    const historyContent = document.getElementById('historyContent');
    
    if (calculationHistory.length === 0) {
        historyContent.innerHTML = '<div class="alert alert-info">Chưa có lịch sử tính toán nào</div>';
    } else {
        let html = `
            <div class="table-responsive">
                <table class="table table-bordered table-hover">
                    <thead>
                        <tr>
                            <th>Thời gian</th>
                            <th>Số nguyên tố p</th>
                            <th>Số phần tử sinh</th>
                            <th>Tỷ lệ phần tử sinh</th>
                        </tr>
                    </thead>
                    <tbody>`;
        
        calculationHistory.forEach(entry => {
            const percentage = ((entry.totalCount / entry.phi) * 100).toFixed(2);
            html += `
                <tr>
                    <td>${entry.timestamp}</td>
                    <td>${entry.prime}</td>
                    <td>${entry.totalCount}</td>
                    <td>${percentage}%</td>
                </tr>`;
        });
        
        html += `
                    </tbody>
                </table>
            </div>`;
        historyContent.innerHTML = html;
    }
    
    historyModal.show();
} 