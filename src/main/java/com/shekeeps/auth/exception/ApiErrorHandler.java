package com.shekeeps.auth.exception;

import com.shekeeps.auth.exception.ApiException;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.*;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestControllerAdvice
public class ApiErrorHandler {
    @ExceptionHandler(ApiException.class) ResponseEntity<?> api(ApiException ex) { return ResponseEntity.status(ex.status()).body(Map.of("status",ex.status().is4xxClientError()?"fail":"error","message",ex.getMessage())); }
    @ExceptionHandler(MethodArgumentNotValidException.class) ResponseEntity<?> validation(MethodArgumentNotValidException ex) {
        var errors=ex.getBindingResult().getFieldErrors().stream().map(e->Map.of("field",e.getField(),"message",e.getDefaultMessage()==null?"Invalid value":e.getDefaultMessage())).toList();
        return ResponseEntity.badRequest().body(Map.of("status","fail","message","Validation failed","errors",errors));
    }
    @ExceptionHandler(DuplicateKeyException.class) ResponseEntity<?> duplicate() { return ResponseEntity.status(409).body(Map.of("status","fail","message","An account with this email address already exists")); }
    @ExceptionHandler(org.springframework.dao.EmptyResultDataAccessException.class) ResponseEntity<?> notFound() { return ResponseEntity.status(404).body(Map.of("status","fail","message","Item not found")); }
    @ExceptionHandler(Exception.class) ResponseEntity<?> other(Exception ex) { return ResponseEntity.status(500).body(Map.of("status","error","message","Internal server error")); }
}
