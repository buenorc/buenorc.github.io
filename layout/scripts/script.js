
const inputs = document.querySelectorAll(".input");

function focusFunc() {
  let parent = this.parentNode;
  parent.classList.add("focus");
}

function blurFunc() {
  let parent = this.parentNode;
  if (this.value == "") {
    parent.classList.remove("focus");
  }
}

inputs.forEach((input) => {
  input.addEventListener("focus", focusFunc);
  input.addEventListener("blur", blurFunc);
});

var form = document.getElementById("my-form");

 async function handleSubmit(event) {
   event.preventDefault();
   var status = document.getElementById("status");
   var data = new FormData(event.target);
   fetch(event.target.action, {
     method: form.method,
     body: data,
     headers: {
         'Accept': 'application/json'
     }
   }).then(response => {
     if (response.ok) {
       status.innerHTML = "Thanks for your submission!";
       status.classList.add('success')
       form.reset()
     } else {
       response.json().then(data => {
         if (Object.hasOwn(data, 'errors')) {
           status.classList.add('error')
           status.innerHTML = data["errors"].map(error => error["message"]).join(", ")
         } else {
           status.classList.add('error')
           status.innerHTML = "Oops! There was a problem submitting your form"
         }
       })
     }
   }).catch(error => {
     status.innerHTML = "Oops! There was a problem submitting your form"
   });
 }
 form.addEventListener("submit", handleSubmit)

 /* Slideshow */

 var slideIndex = 1;
 showSlides(slideIndex);

 function plusSlides(n) {
   showSlides(slideIndex += n);
 }

 function currentSlide(n) {
   showSlides(slideIndex = n);
 }

 function showSlides(n) {
   var i;
   var slides = document.getElementsByClassName("mySlides");
   var dots = document.getElementsByClassName("dot");
   if (n > slides.length) {slideIndex = 1}
   if (n < 1) {slideIndex = slides.length}
   for (i = 0; i < slides.length; i++) {
       slides[i].style.display = "none";
   }
   for (i = 0; i < dots.length; i++) {
       dots[i].className = dots[i].className.replace(" active", "");
   }
   slides[slideIndex-1].style.display = "block";
   dots[slideIndex-1].className += " active";
 }
 document.onkeydown = checkKey;

 function checkKey(e) {

     e = e || window.event;

     if (e.keyCode == '37') {
        // left arrow
        plusSlides(-1);
     }
     else if (e.keyCode == '39') {
        // right arrow
        plusSlides(1);
     }

 }
