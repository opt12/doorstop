%setdefault('has_index', True)
%setdefault('has_matrix', True)
% rebase('base.tpl', stylesheet='doorstop.css')
<header class="navbar navbar-expand-lg navbar-dark bd-navbar sticky-top text-bg-secondary">
  <nav class="container-xxl bd-gutter flex-wrap flex-lg-nowrap" aria-label="Document attributes">
    <div class="container-fluid">
      <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNavDropdown"
        aria-controls="navbarNavDropdown" aria-expanded="false" aria-label="Toggle navigation">
        <span class="navbar-toggler-icon"></span>
      </button>
      <div class="collapse navbar-collapse" id="navbarNavDropdown">
        <ul class="navbar-nav">
          % if is_doc:
          % tmpRef='../'
          % else:
          % tmpRef=''
          % end
          % if has_index:
          <li class="nav-item">
            <a class="nav-link" href="{{ tmpRef }}index.html">Documents</a>
          </li>
          % end
          % if has_matrix:
          <li class="nav-item">
            <a class="nav-link" href="{{ tmpRef }}traceability.html">Traceability</a>
          </li>
          % end
          % if toc:
          <li class="nav-item dropdown">
            <a class="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false">
              Contents
            </a>
            <ul class="dropdown-menu" style="max-height: 70vh; overflow-y: auto;">
              % old_depth = 0
              % for item in toc:
                % if item['depth'] > old_depth:
                  % for _ in range(item['depth'] - old_depth):
                    <ul>
                  % end
                % elif item['depth'] < old_depth: 
                  % for _ in range(old_depth - item['depth']): 
                    </ul>
                  % end
                % end
                <li>
                  <a class="dropdown-item text-truncate"
                    href="#{{item['uid']}}"
                    data-bs-toggle="tooltip"
                    data-bs-placement="left"
                    title="{{item['uid']}}">{{item['text']}}</a>
                </li>
                % old_depth = item['depth']
              % end
              % for _ in range(old_depth):
                </ul>
              % end
            </ul>
          </li>
          % end
        </ul>
      </div>
    </div>
    <div class="container-fluid">
      <div class="row">
        <div class="col-2">
          <div class="bd-lead text-nowrap">
            <!-- Insert logotype. -->
            <img src="{{baseurl}}{{tmpRef}}template/logo-black-white.png" alt="Doorstop" height="128"
              class="d-inline-block align-text-top">
          </div>
        </div>
        <div class="col-6 align-self-center">
          <div class="bd-lead text-nowrap text-center">
            <span class="text-monospace"><strong>{{doc_attributes["name"]}}</strong></span>
          </div>
        </div>
        <div class="col-2">
          <div class="bd-lead text-nowrap">
            <span class="text-muted">Ref</span>
            <p><span class="text-monospace">{{doc_attributes["ref"]}}</span></p>
          </div>
        </div>
        <div class="col-2">
          <div class="bd-lead text-nowrap">
            <span class="text-muted">By</span>
            <p><span class="text-monospace">{{doc_attributes["by"]}}</span></p>
            <span class="text-muted">Issue</span>
            <p><span class="text-monospace">{{doc_attributes["major"]}}{{doc_attributes["minor"]}}</span></p>
          </div>
        </div>
      </div>
    </div>
    </div>
  </nav>
</header>
<div class="container-xxl bd-gutter mt-3 my-md-4 bd-layout">
  <main class="bd-main order-1">
    <div class="bd-intro ps-lg-4">
      <H1>{{!doc_attributes["title"]}}</H1>
      {{!body}}
    </div>
  </main>
</div>
{{!
  ============================================================================
  Doorstop Item CSS Class Assignment
  ============================================================================
  
  This script block applies CSS classes to requirement items based on their
  attributes defined in YAML files.
  
  HOW IT WORKS:
  -------------
  1. Item attributes are collected from the document object (Python/Bottle)
  2. JavaScript iterates over all items and finds their HTML elements by ID
  3. CSS classes are added to elements based on attribute values
  4. Attribute values are sanitized to create valid CSS class names
  
  ADDING NEW ATTRIBUTES:
  ----------------------
  To add support for a new attribute (e.g., 'priority'):
  
  1. Add attribute collection in the FOR loop:
     
     In template code:
       if item.get('priority'):
         priority: "VALUE_FROM_ITEM",
  
  2. Add the class assignment logic (in the forEach function):
  
     if (attrs.priority) {
       var sanitized = sanitizeForClass(attrs.priority);
       if (sanitized) {
         el.classList.add('priority-' + sanitized);
       }
     }
  
  3. Define CSS styles in doorstop.css:
  
     .priority-high {
       border-color: red;
     }
  
  SANITIZATION:
  -------------
  Attribute values are automatically sanitized for use in CSS class names:
  - Converted to lowercase
  - Whitespace replaced with dashes
  - Special characters replaced with dashes
  - Multiple consecutive dashes collapsed to one
  
  Examples:
    "Test & Inspection"  →  "test-inspection"
    "High Priority"      →  "high-priority"
    "Status: Draft"      →  "status-draft"
  
  SUPPORTED ATTRIBUTES (current):
  -------------------------------
  - normative           : Boolean (true/false) → 'normative' or 'non-normative'
  - verification-method : String → 'verification-method-{value}'
  
  TROUBLESHOOTING:
  ----------------
  - Check browser console for warnings about missing elements
  - Verify attribute names match exactly (case-sensitive in YAML)
  - Ensure CSS classes are defined in doorstop.css
  - Use browser DevTools to inspect element classes
  
  ============================================================================
}}

% if document and hasattr(document, 'items'):
<script>
(function() {
  'use strict';
  
  /**
   * Sanitize attribute value for use in CSS class name
   * @param {string} value - The attribute value to sanitize
   * @returns {string} - Sanitized CSS class name fragment
   */
  function sanitizeForClass(value) {
    if (!value) return '';
    return String(value)
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')           // Whitespace → dash
      .replace(/[^a-z0-9-_]/g, '-')   // Invalid chars → dash
      .replace(/-+/g, '-')            // Multiple dashes → single dash
      .replace(/^-|-$/g, '');         // Remove leading/trailing dashes
  }
  
  // ========================================
  // Item Data Collection
  // ========================================
  // This object contains all items with their attributes.
  // To add more attributes, add them in the loop below.
  
  const items = {
% for item in document.items:
    "{{item.uid}}": {
      // Boolean: normative status (always included)
      normative: {{!'true' if item.get('normative', True) else 'false'}},
      
      // String: verification method
      // To add more attributes, copy this pattern:
% if item.get('verification-method'):
      verificationMethod: "{{item.get('verification-method')}}",
% end
      // ADD YOUR CUSTOM ATTRIBUTES HERE:
      // Example:
      // % if item.get('your-attribute'):
      //   yourAttribute: "{{item.get('your-attribute')}}",
      // % end
    },
% end
  };
  
  // ========================================
  // CSS Class Application
  // ========================================
  // This loop applies CSS classes to each item's HTML element.
  
  Object.entries(items).forEach(function(entry) {
    var uid = entry[0];
    var attrs = entry[1];
    var el = document.getElementById(uid);
    
    // Skip if element not found in DOM
    if (!el) return;
    
    // --- Normative Status (Boolean) ---
    // Always applied: either 'normative' or 'non-normative'
    el.classList.add(attrs.normative ? 'normative' : 'non-normative');
    
    // --- Verification Method (String) ---
    // Applied only if attribute exists
    if (attrs.verificationMethod) {
      var sanitized = sanitizeForClass(attrs.verificationMethod);
      if (sanitized) {
        el.classList.add('verification-method-' + sanitized);
      }
    }
    
    // ADD YOUR CUSTOM ATTRIBUTE HANDLERS HERE:
    // Example:
    // if (attrs.yourAttribute) {
    //   var sanitized = sanitizeForClass(attrs.yourAttribute);
    //   if (sanitized) {
    //     el.classList.add('your-prefix-' + sanitized);
    //   }
    // }
  });
  
  // Optional: Log completion
  // console.log('Applied CSS classes to ' + Object.keys(items).length + ' items');
  
})();
</script>
% end

{{!
  ============================================================================
  End of Item CSS Class Assignment
  ============================================================================
}}
<script src="{{baseurl}}{{tmpRef}}template/bootstrap.bundle.min.js"></script>