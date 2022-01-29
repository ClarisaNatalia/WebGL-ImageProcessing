"use strict";

function main() {
  var image = new Image();
  image.src = "image2.jpg";  // diubah sesuai dengan nama gambar, harus satu folder dengan file kode
  image.onload = function() {
    render(image);
  };
}

function render(image) {
  // mengambil webgl konteks
  /** @type {HTMLCanvasElement} */
  var canvas = document.querySelector("#canvas");
  var gl = canvas.getContext("webgl");
  if (!gl) {
    return;
  }

  // membuat glsl program
  var program = webglUtils.createProgramFromScripts(gl, ["vertex-shader-2d", "fragment-shader-2d"]);

  // mencari tempat dimana vertex data diletakkan
  var positionLocation = gl.getAttribLocation(program, "a_position");
  var texcoordLocation = gl.getAttribLocation(program, "a_texCoord");

  // membuat buffer tempat menyimpan 2d clip 
  var positionBuffer = gl.createBuffer();
  // Bind ke ARRAY_BUFFER 
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  // membuat sebuah persegi panjang yang ukurannya sesuai dengan gambar
  setRectangle( gl, 0, 0, image.width, image.height);

  // memberikan info koordinat tekstur
  var texcoordBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, texcoordBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      0.0,  0.0,
      1.0,  0.0,
      0.0,  1.0,
      0.0,  1.0,
      1.0,  0.0,
      1.0,  1.0,
  ]), gl.STATIC_DRAW);

  // membuat tekstur
  var texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);

  // parameter untuk saat render
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  // Upload gambar jadi tekstur
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

  // mencari uniforms
  var resolutionLocation = gl.getUniformLocation(program, "u_resolution");
  var textureSizeLocation = gl.getUniformLocation(program, "u_textureSize");
  var kernelLocation = gl.getUniformLocation(program, "u_kernel[0]");
  var kernelWeightLocation = gl.getUniformLocation(program, "u_kernelWeight");

  // convolution kernel
  var kernels = {
    normal: [
      0, 0, 0,
      0, 1, 0,
      0, 0, 0
    ],
    gaussianBlur: [
      0.045, 0.122, 0.045,
      0.122, 0.332, 0.122,
      0.045, 0.122, 0.045
    ],
    gaussianBlur2: [
      1, 2, 1,
      2, 4, 2,
      1, 2, 1
    ],
    gaussianBlur3: [
      0, 1, 0,
      1, 1, 1,
      0, 1, 0
    ],
    unsharpen: [
      -1, -1, -1,
      -1,  9, -1,
      -1, -1, -1
    ],
    sharpness: [
       0,-1, 0,
      -1, 5,-1,
       0,-1, 0
    ],
    sharpen: [
       -1, -1, -1,
       -1, 16, -1,
       -1, -1, -1
    ],
    edgeDetect: [
       -0.125, -0.125, -0.125,
       -0.125,  1,     -0.125,
       -0.125, -0.125, -0.125
    ],
    edgeDetect2: [
       -1, -1, -1,
       -1,  8, -1,
       -1, -1, -1
    ],
    edgeDetect3: [
       -5, 0, 0,
        0, 0, 0,
        0, 0, 5
    ],
    edgeDetect4: [
       -1, -1, -1,
        0,  0,  0,
        1,  1,  1
    ],
    edgeDetect5: [
       -1, -1, -1,
        2,  2,  2,
       -1, -1, -1
    ],
    edgeDetect6: [
       -5, -5, -5,
       -5, 39, -5,
       -5, -5, -5
    ],
    sobelHorizontal: [
        1,  2,  1,
        0,  0,  0,
       -1, -2, -1
    ],
    sobelVertical: [
        1,  0, -1,
        2,  0, -2,
        1,  0, -1
    ],
    previtHorizontal: [
        1,  1,  1,
        0,  0,  0,
       -1, -1, -1
    ],
    previtVertical: [
        1,  0, -1,
        1,  0, -1,
        1,  0, -1
    ],
    boxBlur: [
        0.111, 0.111, 0.111,
        0.111, 0.111, 0.111,
        0.111, 0.111, 0.111
    ],
    triangleBlur: [
        0.0625, 0.125, 0.0625,
        0.125,  0.25,  0.125,
        0.0625, 0.125, 0.0625
    ],
    emboss: [
       -2, -1,  0,
       -1,  1,  1,
        0,  1,  2
    ]
  };
  var initialSelection = 'edgeDetect2';

  // Setup UI untuk milih kernel
  var ui = document.querySelector("#ui");
  var select = document.createElement("select");
  for (var name in kernels) {
    var option = document.createElement("option");
    option.value = name;
    if (name === initialSelection) {
      option.selected = true;
    }
    option.appendChild(document.createTextNode(name));
    select.appendChild(option);
  }
  select.onchange = function(event) {
    drawWithKernel(this.options[this.selectedIndex].value);
  };
  ui.appendChild(select);
  drawWithKernel(initialSelection);

  function computeKernelWeight(kernel) {
    var weight = kernel.reduce(function(prev, curr) {
        return prev + curr;
    });
    return weight <= 0 ? 1 : weight;
  }

  function drawWithKernel(name) {
    webglUtils.resizeCanvasToDisplaySize(gl.canvas);

    // convert clip space menjadi pixel
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    // membersihkan canvas
    gl.clearColor(0.5, 0.6, 0.6, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // pake progrm yang telah kita buat
    gl.useProgram(program);

    // Turn on atribut posisi
    gl.enableVertexAttribArray(positionLocation);

    // Bind sebuah position buffer.
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

    // position attribute ambil data dari positionBuffer
    var size = 2;          // 2 components per iteration
    var type = gl.FLOAT;   // the data is 32bit floats
    var normalize = false; // don't normalize the data
    var stride = 0;        // 0 = move forward size * sizeof(type) each iteration to get the next position
    var offset = 0;        // start at the beginning of the buffer
    gl.vertexAttribPointer(
        positionLocation, size, type, normalize, stride, offset);

    // Turn on atribut texcoord 
    gl.enableVertexAttribArray(texcoordLocation);

    // bind sebuah texcoord buffer.
    gl.bindBuffer(gl.ARRAY_BUFFER, texcoordBuffer);

    // texcoord atribut ambil data dari texcoordBuffer
    var size = 2;          // 2 components per iteration
    var type = gl.FLOAT;   // the data is 32bit floats
    var normalize = false; // don't normalize the data
    var stride = 0;        // 0 = move forward size * sizeof(type) each iteration to get the next position
    var offset = 0;        // start at the beginning of the buffer
    gl.vertexAttribPointer(
        texcoordLocation, size, type, normalize, stride, offset);

    // set resolusi
    gl.uniform2f(resolutionLocation, gl.canvas.width, gl.canvas.height);

    // set ukuran gambar
    gl.uniform2f(textureSizeLocation, image.width, image.height);

    // set kernel dan berat yang telah dihitung
    gl.uniform1fv(kernelLocation, kernels[name]);
    gl.uniform1f(kernelWeightLocation, computeKernelWeight(kernels[name]));

    // gambar persegi panjang
    var primitiveType = gl.TRIANGLES;
    var offset = 0;
    var count = 6;
    gl.drawArrays(primitiveType, offset, count);
  }
}

//fungsi tambahan untuk membuat sebuah persegi panjang yang sesuai dengan ukuran gambar
function setRectangle(gl, x, y, width, height) {
  var x1 = x;
  var x2 = x + width;
  var y1 = y;
  var y2 = y + height;
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
     x1, y1,
     x2, y1,
     x1, y2,
     x1, y2,
     x2, y1,
     x2, y2,
  ]), gl.STATIC_DRAW);
}

main();
