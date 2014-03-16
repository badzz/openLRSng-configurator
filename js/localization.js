function localize() {
    var localized = 0;

    var translate = function(messageID, args) {
        localized++;

        return chrome.i18n.getMessage(messageID, args);
    };

    $('[i18n]:not(.i18n-replaced').each(function() {
        var element = $(this);

        element.html(translate(element.attr('i18n')));
        element.addClass('i18n-replaced');
    });

    $('[i18n_title]:not(.i18n-replaced').each(function() {
        var element = $(this);

        element.attr('title', translate(element.attr('i18n_title')));
        element.addClass('i18n-replaced');
    });

    $('[i18n_value]:not(.i18n-replaced').each(function() {
        var element = $(this);

        element.val(translate(element.attr('i18n_value')));
        element.addClass('i18n-replaced');
    });

    return localized;
}